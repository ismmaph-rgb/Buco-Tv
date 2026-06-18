import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeRequest, detectStreamType, rewriteM3u8Lines } from "../lib/proxy-utils";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const dataPath = path.resolve(process.cwd(), "data/channels.json");

type Channel = { id: number; name: string; stream: string };

function loadChannels(): Channel[] {
  const raw = readFileSync(dataPath, "utf-8");
  return JSON.parse(raw) as Channel[];
}

// ─── GET /stream/:id ─────────────────────────────────────────────────────────
router.get("/stream/:id", (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid channel ID" }); return; }

  let channels: Channel[];
  try { channels = loadChannels(); } catch {
    res.status(500).json({ error: "Cannot read channels.json" }); return;
  }

  const channel = channels.find((c) => c.id === id);
  if (!channel) { res.status(404).json({ error: `Channel ${id} not found` }); return; }

  const streamType = detectStreamType(channel.stream);

  logger.info({ channelId: id, channelName: channel.name, streamUrl: channel.stream, streamType }, "[STREAM PROXY] request started");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  makeRequest(channel.stream)
    .then(({ res: upstream, finalUrl }) => {
      const status = upstream.statusCode ?? 0;
      const ct = upstream.headers["content-type"] ?? "";

      logger.info({ channelId: id, responseStatus: status, responseContentType: ct, finalUrl }, "[STREAM PROXY] upstream connected");

      if (status < 200 || status >= 300) {
        upstream.resume();
        res.status(502).json({ error: `Upstream returned ${status}`, type: "upstream_error", channelId: id, streamUrl: channel.stream });
        return;
      }

      if (streamType === "hls") {
        let raw = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (chunk) => { raw += chunk; });
        upstream.on("end", () => {
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.send(rewriteM3u8Lines(raw, finalUrl, "/proxy-segment"));
        });
        upstream.on("error", (err) => {
          logger.error({ err, channelId: id }, "[STREAM PROXY] HLS read error");
          if (!res.headersSent) res.status(502).json({ error: err.message });
        });
      } else {
        let outCt = ct;
        if (!outCt || outCt.includes("octet-stream")) {
          const lower = finalUrl.toLowerCase().split("?")[0];
          outCt = lower.endsWith(".mp4") ? "video/mp4" : "video/mp2t";
        }
        res.setHeader("Content-Type", outCt);
        res.on("close", () => upstream.destroy());
        upstream.on("error", () => {});
        upstream.pipe(res);
      }
    })
    .catch((err: Error) => {
      logger.error({ err, channelId: id, streamUrl: channel.stream }, "[STREAM PROXY] proxy error");
      if (res.headersSent) return;

      let type = "proxy_error";
      let msg = err.message;
      if (msg.includes("timed out")) { type = "timeout"; msg = "Stream timeout — el canal puede estar caído"; }
      else if (msg.includes("ECONNREFUSED")) { type = "connection_refused"; msg = "Conexión rechazada — servidor caído"; }
      else if (msg.includes("ENOTFOUND")) { type = "dns_error"; msg = "Host no encontrado — URL inválida"; }

      res.status(502).json({ error: msg, type, channelId: id, channelName: channel.name, streamUrl: channel.stream, originalError: err.message });
    });
});

// ─── GET /proxy-segment ───────────────────────────────────────────────────────
router.get("/proxy-segment", (req, res) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) { res.status(400).json({ error: "Missing url parameter" }); return; }

  let decodedUrl: string;
  try { decodedUrl = decodeURIComponent(rawUrl); new URL(decodedUrl); } catch {
    res.status(400).json({ error: "Invalid URL" }); return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  makeRequest(decodedUrl)
    .then(({ res: upstream, finalUrl }) => {
      const status = upstream.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        upstream.resume();
        res.status(502).json({ error: `Segment fetch error: ${status}` }); return;
      }
      const ct = upstream.headers["content-type"];
      if (ct) res.setHeader("Content-Type", ct);

      const isM3u8 = finalUrl.toLowerCase().split("?")[0].endsWith(".m3u8") || (ct ?? "").includes("mpegurl");
      if (isM3u8) {
        let raw = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (c) => { raw += c; });
        upstream.on("end", () => {
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.send(rewriteM3u8Lines(raw, finalUrl, "/proxy-segment"));
        });
        upstream.on("error", (e) => { if (!res.headersSent) res.status(502).json({ error: e.message }); });
      } else {
        res.on("close", () => upstream.destroy());
        upstream.on("error", () => {});
        upstream.pipe(res);
      }
    })
    .catch((err: Error) => {
      if (!res.headersSent) res.status(502).json({ error: err.message });
    });
});

// ─── GET /api/test-stream/:id ─────────────────────────────────────────────────
router.get("/api/test-stream/:id", async (req, res) => {
  const id = Number(req.params.id);
  let channels: Channel[];
  try { channels = loadChannels(); } catch {
    res.status(500).json({ ok: false, error: "Cannot read channels.json" }); return;
  }

  const channel = channels.find((c) => c.id === id);
  if (!channel) { res.json({ ok: false, error: `Channel ${id} not found` }); return; }

  const result: Record<string, unknown> = {
    channelId: id, channelName: channel.name, channelFound: true,
    originalUrl: channel.stream, streamType: detectStreamType(channel.stream),
  };

  try {
    const { res: upstream, finalUrl } = await makeRequest(channel.stream);
    upstream.destroy();
    result.ok = true; result.canConnect = true;
    result.httpStatus = upstream.statusCode;
    result.contentType = upstream.headers["content-type"] ?? null;
    result.finalUrl = finalUrl;
    result.redirected = finalUrl !== channel.stream;
    result.proxyStreamUrl = `/stream/${id}`;
  } catch (err: unknown) {
    const e = err as Error;
    result.ok = false; result.canConnect = false;
    result.errorMessage = e.message; result.errorType = e.constructor?.name ?? "Error";
  }

  res.json(result);
});

export default router;
