import { useState, useCallback } from "react";
import { Navbar } from "@/components/layout/navbar";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Play,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

type ChannelStatus =
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
  | "UNKNOWN"
  | "PENDING";

type AuditResult = {
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

type AuditResponse = {
  testedAt: string;
  summary: {
    total: number;
    ok: number;
    failed: number;
    percentOperational: number;
  };
  results: AuditResult[];
};

const STATUS_CONFIG: Record<
  ChannelStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  OK: {
    label: "OK",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  },
  DNS_ERROR: {
    label: "DNS_ERROR",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: <WifiOff className="w-4 h-4 text-red-400" />,
  },
  HTTP_401: {
    label: "HTTP_401",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    icon: <XCircle className="w-4 h-4 text-orange-400" />,
  },
  HTTP_403: {
    label: "HTTP_403",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    icon: <XCircle className="w-4 h-4 text-orange-400" />,
  },
  HTTP_404: {
    label: "HTTP_404",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    icon: <XCircle className="w-4 h-4 text-yellow-400" />,
  },
  HTTP_500: {
    label: "HTTP_500",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: <XCircle className="w-4 h-4 text-red-400" />,
  },
  TIMEOUT: {
    label: "TIMEOUT",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    icon: <Clock className="w-4 h-4 text-yellow-400" />,
  },
  PROXY_ERROR: {
    label: "PROXY_ERROR",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
  },
  HLS_INVALID: {
    label: "HLS_INVALID",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    icon: <AlertTriangle className="w-4 h-4 text-purple-400" />,
  },
  DASH_INVALID: {
    label: "DASH_INVALID",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    icon: <AlertTriangle className="w-4 h-4 text-purple-400" />,
  },
  UNSUPPORTED_FORMAT: {
    label: "UNSUPPORTED",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    icon: <AlertTriangle className="w-4 h-4 text-blue-400" />,
  },
  UNKNOWN: {
    label: "UNKNOWN",
    color: "text-zinc-400",
    bg: "bg-zinc-500/10 border-zinc-500/20",
    icon: <AlertTriangle className="w-4 h-4 text-zinc-400" />,
  },
  PENDING: {
    label: "PENDIENTE",
    color: "text-zinc-500",
    bg: "bg-zinc-800/50 border-zinc-700/20",
    icon: <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />,
  },
};

function StatusBadge({ status }: { status: ChannelStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNKNOWN;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-mono font-bold ${cfg.bg} ${cfg.color}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const ALL_STATUSES: ChannelStatus[] = [
  "OK", "DNS_ERROR", "HTTP_401", "HTTP_403", "HTTP_404",
  "HTTP_500", "TIMEOUT", "PROXY_ERROR", "HLS_INVALID",
  "DASH_INVALID", "UNSUPPORTED_FORMAT", "UNKNOWN",
];

export function Debug() {
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ChannelStatus | "ALL">("ALL");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuditData(null);
    setExpandedId(null);
    try {
      const resp = await fetch("/api/audit");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: AuditResponse = await resp.json();
      setAuditData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  const exportJson = useCallback(() => {
    if (!auditData) return;
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buco-tv-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [auditData]);

  const filtered = auditData?.results.filter(
    (r) => filterStatus === "ALL" || r.status === filterStatus
  ) ?? [];

  const statusCounts =
    auditData?.results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}) ?? {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Wifi className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Auditoría de Canales</h1>
          </div>
          <p className="text-white/50 text-sm">
            Comprueba el estado real de cada stream antes de publicar la plataforma.
          </p>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={runAudit}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-black font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {loading ? "Probando canales…" : "Probar todos los canales"}
          </button>

          {auditData && (
            <button
              onClick={exportJson}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white font-medium rounded-lg hover:bg-white/15 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar JSON
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            Error al ejecutar la auditoría: {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw className="w-10 h-10 text-primary animate-spin" />
            <p className="text-white/60 font-medium">Probando todos los canales…</p>
            <p className="text-white/30 text-sm">Esto puede tomar hasta 60 segundos</p>
          </div>
        )}

        {/* Summary */}
        {auditData && !loading && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900 border border-white/5 rounded-xl p-5">
                <div className="text-3xl font-bold text-white">{auditData.summary.total}</div>
                <div className="text-sm text-white/50 mt-1">Total de canales</div>
              </div>
              <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-5">
                <div className="text-3xl font-bold text-emerald-400">{auditData.summary.ok}</div>
                <div className="text-sm text-white/50 mt-1">Canales funcionales</div>
              </div>
              <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-5">
                <div className="text-3xl font-bold text-red-400">{auditData.summary.failed}</div>
                <div className="text-sm text-white/50 mt-1">Canales con error</div>
              </div>
              <div className="bg-zinc-900 border border-white/5 rounded-xl p-5">
                <div className="text-3xl font-bold text-primary">{auditData.summary.percentOperational}%</div>
                <div className="text-sm text-white/50 mt-1">Porcentaje operativo</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-8 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-1000"
                style={{ width: `${auditData.summary.percentOperational}%` }}
              />
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setFilterStatus("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filterStatus === "ALL" ? "bg-white/15 border-white/20 text-white" : "border-white/10 text-white/50 hover:text-white hover:border-white/20"}`}
              >
                Todos ({auditData.results.length})
              </button>
              {ALL_STATUSES.filter((s) => statusCounts[s]).map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filterStatus === s ? `${cfg.bg} ${cfg.color}` : "border-white/10 text-white/50 hover:text-white hover:border-white/20"}`}
                  >
                    {cfg.label} ({statusCounts[s]})
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 border-b border-white/5">
                      <th className="text-left px-4 py-3 text-white/40 font-medium w-12">ID</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium">Nombre</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium hidden md:table-cell">Categoría</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium">Estado</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium hidden lg:table-cell">HTTP</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium hidden xl:table-cell">Tipo</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium hidden xl:table-cell">Tiempo</th>
                      <th className="text-left px-4 py-3 text-white/40 font-medium">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <>
                        <tr
                          key={r.id}
                          onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                          className={`border-b border-white/5 cursor-pointer transition-colors ${i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50"} hover:bg-white/5`}
                        >
                          <td className="px-4 py-3 text-white/40 font-mono">{r.id}</td>
                          <td className="px-4 py-3 font-medium text-white">{r.name}</td>
                          <td className="px-4 py-3 text-white/50 hidden md:table-cell">{r.category}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {r.httpStatus !== null ? (
                              <span className={`font-mono text-xs font-bold ${r.httpStatus >= 200 && r.httpStatus < 300 ? "text-emerald-400" : "text-red-400"}`}>
                                {r.httpStatus}
                              </span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="text-xs font-mono text-white/40 uppercase">{r.streamType}</span>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="text-xs font-mono text-white/40">{r.elapsedMs}ms</span>
                          </td>
                          <td className="px-4 py-3 text-white/60 text-xs max-w-xs truncate">
                            {r.status === "OK" ? (
                              <span className="text-emerald-400">Stream accesible</span>
                            ) : (
                              r.diagnosis
                            )}
                          </td>
                        </tr>

                        {/* Expanded row */}
                        {expandedId === r.id && (
                          <tr key={`${r.id}-detail`} className="border-b border-white/5 bg-zinc-900">
                            <td colSpan={8} className="px-4 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider">Detalles del Stream</h4>
                                  <div className="bg-black/40 rounded-lg p-3 font-mono text-xs space-y-2 border border-white/5">
                                    <div className="flex gap-2">
                                      <span className="text-white/30 w-24 shrink-0">URL</span>
                                      <span className="text-white/70 break-all">{r.originalUrl}</span>
                                    </div>
                                    {r.finalUrl && r.redirected && (
                                      <div className="flex gap-2">
                                        <span className="text-white/30 w-24 shrink-0">URL final</span>
                                        <span className="text-yellow-400/80 break-all">{r.finalUrl}</span>
                                      </div>
                                    )}
                                    <div className="flex gap-2">
                                      <span className="text-white/30 w-24 shrink-0">Tipo</span>
                                      <span className="text-white/60 uppercase">{r.streamType}</span>
                                    </div>
                                    {r.contentType && (
                                      <div className="flex gap-2">
                                        <span className="text-white/30 w-24 shrink-0">Content-Type</span>
                                        <span className="text-white/60">{r.contentType}</span>
                                      </div>
                                    )}
                                    <div className="flex gap-2">
                                      <span className="text-white/30 w-24 shrink-0">Tiempo</span>
                                      <span className="text-white/60">{r.elapsedMs}ms</span>
                                    </div>
                                    {r.errorCode && (
                                      <div className="flex gap-2">
                                        <span className="text-white/30 w-24 shrink-0">Código</span>
                                        <span className="text-red-400">{r.errorCode}</span>
                                      </div>
                                    )}
                                    {r.errorMessage && (
                                      <div className="flex gap-2">
                                        <span className="text-white/30 w-24 shrink-0">Error</span>
                                        <span className="text-red-400/80 break-all">{r.errorMessage}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider">Diagnóstico y solución</h4>
                                  <div className="bg-black/40 rounded-lg p-3 text-xs space-y-3 border border-white/5">
                                    <div>
                                      <div className="text-white/30 mb-1">Diagnóstico</div>
                                      <div className="text-white/80">{r.diagnosis}</div>
                                    </div>
                                    {r.suggestedFix && (
                                      <div>
                                        <div className="text-white/30 mb-1">Solución sugerida</div>
                                        <div className="text-yellow-400/80">{r.suggestedFix}</div>
                                      </div>
                                    )}
                                    <div>
                                      <div className="text-white/30 mb-1">Probado el</div>
                                      <div className="text-white/50">{new Date(r.testedAt).toLocaleString("es-AR")}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length === 0 && !loading && (
                <div className="text-center py-12 text-white/30">
                  No hay canales con ese estado
                </div>
              )}
            </div>

            <p className="text-xs text-white/20 mt-4 text-right">
              Auditoría realizada: {new Date(auditData.testedAt).toLocaleString("es-AR")}
              {" · "}
              Hacé clic en una fila para ver el detalle completo
            </p>
          </>
        )}

        {/* Empty state */}
        {!auditData && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Wifi className="w-16 h-16 text-white/10" />
            <h2 className="text-xl font-bold text-white/40">Sin datos aún</h2>
            <p className="text-white/30 text-sm max-w-sm">
              Hacé clic en "Probar todos los canales" para auditar el estado real de cada stream.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
