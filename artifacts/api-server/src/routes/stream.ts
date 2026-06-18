import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const dataPath = path.resolve(process.cwd(), "data/channels.json");

function loadChannels() {
  const raw = readFileSync(dataPath, "utf-8");
  return JSON.parse(raw) as Array<{
    id: number;
    name: string;
    stream: string;
  }>;
}

function detectStreamType(url: string): "hls" | "dash" | "direct" {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".m3u8")) return "hls";
  if (lower.endsWith(".mpd")) return "dash";
  return "direct";
}

function rewriteM3u8Content(
  content: string,
  originalUrl: string,
  channelId: number
): string {
  const base = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);

  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return `/proxy-segment?url=${encodeURIComponent(trimmed)}`;
      }

      const absoluteUrl = new URL(trimmed, base).href;
      return `/proxy-segment?url=${encodeURIComponent(absoluteUrl)}`;
    })
    .join("\n");
}

router.get("/stream/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const channels = loadChannels();
  const channel = channels.find((c) => c.id === id);

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const streamUrl = channel.stream;
  const streamType = detectStreamType(streamUrl);

  logger.info({ channelId: id, channelName: channel.name, streamUrl, streamType }, "Stream requested");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  try {
    if (streamType === "hls") {
      const response = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BUCO-TV-Proxy/1.0)",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.error({ status: response.status, streamUrl }, "Upstream returned error for HLS manifest");
        res.status(502).json({ error: `Upstream error: ${response.status} ${response.statusText}` });
        return;
      }

      const text = await response.text();
      const rewritten = rewriteM3u8Content(text, streamUrl, id);

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.send(rewritten);
    } else {
      const response = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BUCO-TV-Proxy/1.0)",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.error({ status: response.status, streamUrl }, "Upstream returned error for direct stream");
        res.status(502).json({ error: `Upstream error: ${response.status} ${response.statusText}` });
        return;
      }

      const contentType = response.headers.get("content-type") ?? "video/mp2t";
      res.setHeader("Content-Type", contentType);

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(502).json({ error: "Stream body not available" });
        return;
      }

      res.on("close", () => {
        reader.cancel();
        logger.info({ channelId: id }, "Client disconnected, stream cancelled");
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, channelId: id, streamUrl }, "Stream proxy error");

    if (!res.headersSent) {
      if (message.includes("timeout") || message.includes("TimeoutError")) {
        res.status(504).json({ error: "Stream timeout — channel may be down", type: "timeout" });
      } else if (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND")) {
        res.status(502).json({ error: "Cannot reach stream — channel offline", type: "connection" });
      } else {
        res.status(502).json({ error: `Proxy error: ${message}`, type: "proxy" });
      }
    }
  }
});

router.get("/proxy-segment", async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(url);
    new URL(decodedUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  try {
    const response = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BUCO-TV-Proxy/1.0)",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      res.status(502).json({ error: `Segment fetch error: ${response.status}` });
      return;
    }

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    if (decodedUrl.toLowerCase().endsWith(".m3u8")) {
      const text = await response.text();
      const base = decodedUrl.substring(0, decodedUrl.lastIndexOf("/") + 1);
      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return line;
          if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return `/api/proxy-segment?url=${encodeURIComponent(trimmed)}`;
          }
          const abs = new URL(trimmed, base).href;
          return `/api/proxy-segment?url=${encodeURIComponent(abs)}`;
        })
        .join("\n");
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.send(rewritten);
    } else {
      const reader = response.body?.getReader();
      if (!reader) {
        res.status(502).json({ error: "Segment body not available" });
        return;
      }

      res.on("close", () => reader.cancel());

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, url: decodedUrl }, "Segment proxy error");
    if (!res.headersSent) {
      res.status(502).json({ error: `Segment error: ${message}` });
    }
  }
});

export default router;
