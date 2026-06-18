import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const dataPath = path.resolve(process.cwd(), "data/channels.json");

type Channel = {
  id: number;
  name: string;
  category: string;
  logo: string | null;
  stream: string;
  featured: boolean;
  description: string | null;
};

function loadChannels(): Channel[] {
  const raw = readFileSync(dataPath, "utf-8");
  return JSON.parse(raw) as Channel[];
}

function detectStreamType(url: string): "hls" | "direct" {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".m3u8")) return "hls";
  return "direct";
}

function rewriteM3u8Lines(content: string, originalUrl: string, proxyBase: string): string {
  let base: string;
  try {
    const parsed = new URL(originalUrl);
    const lastSlash = parsed.pathname.lastIndexOf("/");
    parsed.pathname = parsed.pathname.substring(0, lastSlash + 1);
    base = parsed.href;
  } catch {
    base = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);
  }

  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      let absUrl: string;
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        absUrl = trimmed;
      } else {
        try {
          absUrl = new URL(trimmed, base).href;
        } catch {
          absUrl = base + trimmed;
        }
      }
      return `${proxyBase}?url=${encodeURIComponent(absUrl)}`;
    })
    .join("\n");
}

function makeRequest(
  targetUrl: string,
  redirectsLeft = 5
): Promise<{ res: http.IncomingMessage; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${targetUrl}`));
    }

    const isHttps = parsed.protocol === "https:";
    const agent = isHttps
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BUCO-TV-Proxy/1.0)",
        Accept: "*/*",
        Connection: "keep-alive",
      },
      timeout: 20000,
      agent,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          return reject(new Error("Too many redirects"));
        }
        const nextUrl = new URL(res.headers.location, targetUrl).href;
        res.resume();
        resolve(makeRequest(nextUrl, redirectsLeft - 1));
        return;
      }

      resolve({ res, finalUrl: targetUrl });
    });

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out after 20s"));
    });

    req.on("error", (err) => reject(err));
    req.end();
  });
}

// ─── GET /stream/:id ─────────────────────────────────────────────────────────
router.get("/stream/:id", (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  let channels: Channel[];
  try {
    channels = loadChannels();
  } catch (e) {
    res.status(500).json({ error: "Cannot read channels.json" });
    return;
  }

  const channel = channels.find((c) => c.id === id);
  if (!channel) {
    res.status(404).json({ error: `Channel ${id} not found` });
    return;
  }

  const streamUrl = channel.stream;
  const streamType = detectStreamType(streamUrl);

  logger.info(
    { channelId: id, channelName: channel.name, streamUrl, streamType },
    "[STREAM PROXY] request started"
  );

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  makeRequest(streamUrl)
    .then(({ res: upstream, finalUrl }) => {
      const status = upstream.statusCode ?? 0;
      const upstreamContentType = upstream.headers["content-type"] ?? "";

      logger.info(
        {
          channelId: id,
          originalUrl: streamUrl,
          finalUrl,
          responseStatus: status,
          responseContentType: upstreamContentType,
        },
        "[STREAM PROXY] upstream connected"
      );

      if (status < 200 || status >= 300) {
        upstream.resume();
        res
          .status(502)
          .json({
            error: `Upstream returned ${status}`,
            type: "upstream_error",
            channelId: id,
            streamUrl,
          });
        return;
      }

      if (streamType === "hls") {
        let rawData = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (chunk) => { rawData += chunk; });
        upstream.on("end", () => {
          const proxyBase = "/proxy-segment";
          const rewritten = rewriteM3u8Lines(rawData, finalUrl, proxyBase);
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.send(rewritten);
        });
        upstream.on("error", (err) => {
          logger.error({ err, channelId: id }, "[STREAM PROXY] HLS read error");
          if (!res.headersSent) res.status(502).json({ error: err.message });
        });
      } else {
        // Detect content type for direct streams
        let ct = upstreamContentType;
        if (!ct || ct.includes("octet-stream")) {
          const lower = finalUrl.toLowerCase().split("?")[0];
          if (lower.endsWith(".ts") || lower.endsWith(".mpeg")) ct = "video/mp2t";
          else if (lower.endsWith(".mp4")) ct = "video/mp4";
          else ct = "video/mp2t";
        }
        res.setHeader("Content-Type", ct);

        upstream.on("error", (err) => {
          logger.error({ err, channelId: id }, "[STREAM PROXY] stream pipe error");
        });

        res.on("close", () => {
          upstream.destroy();
          logger.info({ channelId: id }, "[STREAM PROXY] client disconnected");
        });

        upstream.pipe(res);
      }
    })
    .catch((err: Error) => {
      logger.error(
        { err, channelId: id, streamUrl },
        "[STREAM PROXY] proxy error"
      );

      if (res.headersSent) return;

      let type = "proxy_error";
      let userMessage = err.message;

      if (err.message.includes("timed out") || err.message.includes("ETIMEDOUT")) {
        type = "timeout";
        userMessage = "Stream timeout — el canal puede estar caído";
      } else if (err.message.includes("ECONNREFUSED")) {
        type = "connection_refused";
        userMessage = "Conexión rechazada — el servidor de origen está caído";
      } else if (err.message.includes("ENOTFOUND")) {
        type = "dns_error";
        userMessage = "No se encontró el host — URL inválida o sin internet";
      } else if (err.message.includes("CERT") || err.message.includes("altname") || err.message.includes("TLS")) {
        type = "ssl_error";
        userMessage = "Error SSL del origen (cert inválido) — el proxy ya intenta resolverlo";
      } else if (err.message.includes("redirects")) {
        type = "redirect_loop";
        userMessage = "Demasiadas redirecciones";
      }

      res.status(502).json({
        error: userMessage,
        type,
        channelId: id,
        channelName: channel.name,
        streamUrl,
        originalError: err.message,
      });
    });
});

// ─── GET /proxy-segment ───────────────────────────────────────────────────────
router.get("/proxy-segment", (req, res) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(rawUrl);
    new URL(decodedUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  makeRequest(decodedUrl)
    .then(({ res: upstream, finalUrl }) => {
      const status = upstream.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        upstream.resume();
        res.status(502).json({ error: `Segment fetch error: ${status}` });
        return;
      }

      const ct = upstream.headers["content-type"];
      if (ct) res.setHeader("Content-Type", ct);

      const isNestedM3u8 =
        finalUrl.toLowerCase().split("?")[0].endsWith(".m3u8") ||
        (ct ?? "").includes("mpegurl");

      if (isNestedM3u8) {
        let rawData = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (chunk) => { rawData += chunk; });
        upstream.on("end", () => {
          const rewritten = rewriteM3u8Lines(rawData, finalUrl, "/proxy-segment");
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.send(rewritten);
        });
        upstream.on("error", (err) => {
          if (!res.headersSent) res.status(502).json({ error: err.message });
        });
      } else {
        res.on("close", () => upstream.destroy());
        upstream.on("error", () => {});
        upstream.pipe(res);
      }
    })
    .catch((err: Error) => {
      if (!res.headersSent) {
        res.status(502).json({ error: err.message });
      }
    });
});

// ─── GET /api/test-stream/:id ─────────────────────────────────────────────────
router.get("/api/test-stream/:id", async (req, res) => {
  const id = Number(req.params.id);

  let channels: Channel[];
  try {
    channels = loadChannels();
  } catch (e) {
    res.status(500).json({ ok: false, error: "Cannot read channels.json" });
    return;
  }

  const channel = channels.find((c) => c.id === id);
  if (!channel) {
    res.json({ ok: false, error: `Channel ${id} not found` });
    return;
  }

  const result: Record<string, unknown> = {
    channelId: id,
    channelName: channel.name,
    channelFound: true,
    originalUrl: channel.stream,
    streamType: detectStreamType(channel.stream),
  };

  try {
    const { res: upstream, finalUrl } = await makeRequest(channel.stream);
    upstream.destroy();

    result.ok = true;
    result.canConnect = true;
    result.httpStatus = upstream.statusCode;
    result.contentType = upstream.headers["content-type"] ?? null;
    result.finalUrl = finalUrl;
    result.redirected = finalUrl !== channel.stream;
    result.proxyStreamUrl = `/stream/${id}`;
  } catch (err: unknown) {
    const e = err as Error;
    result.ok = false;
    result.canConnect = false;
    result.errorMessage = e.message;
    result.errorType = e.constructor?.name ?? "Error";
  }

  res.json(result);
});

export default router;
