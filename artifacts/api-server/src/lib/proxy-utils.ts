import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export type StreamType = "hls" | "dash" | "direct";

export function detectStreamType(url: string): StreamType {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".m3u8")) return "hls";
  if (lower.endsWith(".mpd")) return "dash";
  return "direct";
}

export function makeRequest(
  targetUrl: string,
  redirectsLeft = 5,
  timeoutMs = 20000
): Promise<{ res: http.IncomingMessage; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
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
      timeout: timeoutMs,
      agent,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          return reject(new Error("Too many redirects"));
        }
        let nextUrl: string;
        try {
          nextUrl = new URL(res.headers.location, targetUrl).href;
        } catch {
          return reject(new Error(`Invalid redirect URL: ${res.headers.location}`));
        }
        res.resume();
        resolve(makeRequest(nextUrl, redirectsLeft - 1, timeoutMs));
        return;
      }
      resolve({ res, finalUrl: targetUrl });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

export function rewriteM3u8Lines(
  content: string,
  originalUrl: string,
  proxyBase: string
): string {
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
