import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeRequest, detectStreamType } from "../lib/proxy-utils";
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

export type ChannelStatus =
  | "OK"
  | "DNS_ERROR"
  | "HTTP_401"
  | "HTTP_403"
  | "HTTP_404"
  | "HTTP_500"
  | "TIMEOUT"
  | "PROXY_ERROR"
  | "HLS_INVALID"
  | "DASH_INVALID"
  | "UNSUPPORTED_FORMAT"
  | "UNKNOWN";

export type AuditResult = {
  id: number;
  name: string;
  category: string;
  originalUrl: string;
  streamType: string;
  status: ChannelStatus;
  httpStatus: number | null;
  contentType: string | null;
  finalUrl: string | null;
  redirected: boolean;
  diagnosis: string;
  suggestedFix: string;
  elapsedMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  testedAt: string;
};

function classifyError(
  err: Error,
  elapsedMs: number
): Pick<AuditResult, "status" | "diagnosis" | "suggestedFix" | "errorCode" | "errorMessage"> {
  const msg = err.message;

  if (msg.includes("timed out") || msg.includes("ETIMEDOUT") || msg.includes("ESOCKETTIMEDOUT")) {
    return {
      status: "TIMEOUT",
      diagnosis: `Timeout después de ${elapsedMs}ms — el servidor no respondió`,
      suggestedFix: "El servidor de origen está caído o muy lento. Verificar que el stream esté activo.",
      errorCode: "TIMEOUT",
      errorMessage: msg,
    };
  }
  if (msg.includes("ENOTFOUND")) {
    const match = msg.match(/ENOTFOUND\s+(\S+)/);
    const domain = match ? match[1] : "desconocido";
    return {
      status: "DNS_ERROR",
      diagnosis: `DNS no resuelve el dominio: "${domain}"`,
      suggestedFix: `El dominio "${domain}" no existe o no está disponible. Verificar la URL del stream.`,
      errorCode: "ENOTFOUND",
      errorMessage: msg,
    };
  }
  if (msg.includes("ECONNREFUSED")) {
    return {
      status: "PROXY_ERROR",
      diagnosis: "Conexión rechazada — el puerto está cerrado o el servidor no acepta conexiones",
      suggestedFix: "El servidor de origen rechazó la conexión. El stream puede haber cambiado de puerto.",
      errorCode: "ECONNREFUSED",
      errorMessage: msg,
    };
  }
  if (msg.includes("ECONNRESET")) {
    return {
      status: "PROXY_ERROR",
      diagnosis: "Conexión reiniciada por el servidor de origen",
      suggestedFix: "El stream puede requerir autenticación o estar bloqueado por geolocalización.",
      errorCode: "ECONNRESET",
      errorMessage: msg,
    };
  }
  if (msg.includes("Too many redirects")) {
    return {
      status: "PROXY_ERROR",
      diagnosis: "Demasiadas redirecciones (loop de redirects)",
      suggestedFix: "La URL redirige en bucle. Usar la URL final directamente.",
      errorCode: "REDIRECT_LOOP",
      errorMessage: msg,
    };
  }
  if (msg.includes("Invalid URL")) {
    return {
      status: "PROXY_ERROR",
      diagnosis: "URL de stream inválida",
      suggestedFix: "Corregir la URL del canal en channels.json.",
      errorCode: "INVALID_URL",
      errorMessage: msg,
    };
  }
  return {
    status: "PROXY_ERROR",
    diagnosis: `Error de conexión: ${msg.slice(0, 120)}`,
    suggestedFix: "Verificar manualmente la URL del stream.",
    errorCode: "UNKNOWN",
    errorMessage: msg,
  };
}

function classifyHttpStatus(
  status: number,
  contentType: string,
  streamType: string,
  firstBytes: string
): Pick<AuditResult, "status" | "diagnosis" | "suggestedFix"> {
  if (status === 401) {
    return {
      status: "HTTP_401",
      diagnosis: "El stream requiere autenticación (401 Unauthorized)",
      suggestedFix: "Necesita credenciales o token de acceso en la URL.",
    };
  }
  if (status === 403) {
    return {
      status: "HTTP_403",
      diagnosis: "Acceso denegado (403 Forbidden) — posible restricción geográfica o de IP",
      suggestedFix: "El stream bloquea el servidor de Replit. Probar con otra URL o VPN.",
    };
  }
  if (status === 404) {
    return {
      status: "HTTP_404",
      diagnosis: "Stream no encontrado (404) — la URL no existe en el servidor",
      suggestedFix: "La URL del stream cambió. Buscar la URL actualizada del canal.",
    };
  }
  if (status >= 500) {
    return {
      status: "HTTP_500",
      diagnosis: `Error del servidor de origen (${status}) — fallo interno del proveedor`,
      suggestedFix: "El proveedor del stream tiene un problema. Esperar o buscar URL alternativa.",
    };
  }
  if (status >= 200 && status < 300) {
    const ct = contentType.toLowerCase();

    if (streamType === "hls") {
      if (!ct.includes("mpegurl") && !ct.includes("x-mpegurl") && !ct.includes("octet-stream") && !ct.includes("plain")) {
        return {
          status: "HLS_INVALID",
          diagnosis: `URL es .m3u8 pero el servidor responde con Content-Type: "${contentType}"`,
          suggestedFix: "El servidor no devuelve un M3U8 válido. La URL puede ser incorrecta.",
        };
      }
      if (firstBytes && !firstBytes.trimStart().startsWith("#EXTM3U") && !firstBytes.includes("#EXT")) {
        return {
          status: "HLS_INVALID",
          diagnosis: "Respuesta 200 pero el contenido no es un M3U8 válido (falta #EXTM3U)",
          suggestedFix: "La URL devuelve contenido que no es un playlist M3U8.",
        };
      }
    }

    if (streamType === "dash") {
      if (!ct.includes("dash") && !ct.includes("xml") && !ct.includes("octet-stream")) {
        return {
          status: "DASH_INVALID",
          diagnosis: `URL es .mpd pero el servidor responde con Content-Type: "${contentType}"`,
          suggestedFix: "El servidor no devuelve un MPD válido.",
        };
      }
    }

    const supported =
      ct.includes("mpegurl") ||
      ct.includes("mp2t") ||
      ct.includes("video/") ||
      ct.includes("audio/") ||
      ct.includes("application/") ||
      ct.includes("octet-stream") ||
      ct.includes("text/plain");

    if (!supported && ct !== "") {
      return {
        status: "UNSUPPORTED_FORMAT",
        diagnosis: `Formato no soportado: "${contentType}"`,
        suggestedFix: "El servidor responde con un tipo de contenido no compatible con video.",
      };
    }

    return {
      status: "OK",
      diagnosis: "Stream accesible y con formato correcto",
      suggestedFix: "",
    };
  }

  return {
    status: "UNKNOWN",
    diagnosis: `HTTP ${status} — respuesta inesperada`,
    suggestedFix: "Verificar manualmente la URL.",
  };
}

async function auditChannel(channel: Channel): Promise<AuditResult> {
  const started = Date.now();
  const streamType = detectStreamType(channel.stream);
  const base: Omit<AuditResult, "status" | "httpStatus" | "contentType" | "finalUrl" | "redirected" | "diagnosis" | "suggestedFix" | "elapsedMs" | "errorCode" | "errorMessage"> = {
    id: channel.id,
    name: channel.name,
    category: channel.category,
    originalUrl: channel.stream,
    streamType,
    testedAt: new Date().toISOString(),
  };

  try {
    const { res, finalUrl } = await makeRequest(channel.stream, 5, 15000);
    const elapsed = Date.now() - started;
    const status = res.statusCode ?? 0;
    const contentType = res.headers["content-type"] ?? "";

    let firstBytes = "";
    if (streamType === "hls" && status >= 200 && status < 300) {
      await new Promise<void>((resolve) => {
        let collected = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          collected += chunk;
          if (collected.length >= 256) {
            res.destroy();
            resolve();
          }
        });
        res.on("end", resolve);
        res.on("close", resolve);
        res.on("error", resolve);
      });
      firstBytes = "";
    } else {
      res.resume();
    }

    const classification = classifyHttpStatus(status, contentType, streamType, firstBytes);

    return {
      ...base,
      ...classification,
      httpStatus: status,
      contentType: contentType || null,
      finalUrl,
      redirected: finalUrl !== channel.stream,
      elapsedMs: elapsed,
      errorCode: null,
      errorMessage: null,
    };
  } catch (err: unknown) {
    const elapsed = Date.now() - started;
    const e = err as Error;
    const classification = classifyError(e, elapsed);
    return {
      ...base,
      ...classification,
      httpStatus: null,
      contentType: null,
      finalUrl: null,
      redirected: false,
      elapsedMs: elapsed,
    };
  }
}

// GET /api/audit — audit all channels
router.get("/audit", async (_req, res) => {
  let channels: Channel[];
  try {
    const raw = readFileSync(dataPath, "utf-8");
    channels = JSON.parse(raw) as Channel[];
  } catch {
    res.status(500).json({ error: "Cannot read channels.json" });
    return;
  }

  logger.info({ total: channels.length }, "[AUDIT] Starting channel audit");

  // Concurrency-limited parallel audit (max 4 at once)
  const CONCURRENCY = 4;
  const results: AuditResult[] = [];
  const chunks: Channel[][] = [];

  for (let i = 0; i < channels.length; i += CONCURRENCY) {
    chunks.push(channels.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(auditChannel));
    results.push(...chunkResults);
  }

  const ok = results.filter((r) => r.status === "OK").length;
  const failed = results.length - ok;

  logger.info({ total: results.length, ok, failed }, "[AUDIT] Audit complete");

  res.json({
    testedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      ok,
      failed,
      percentOperational: results.length > 0 ? Math.round((ok / results.length) * 100) : 0,
    },
    results,
  });
});

export default router;
