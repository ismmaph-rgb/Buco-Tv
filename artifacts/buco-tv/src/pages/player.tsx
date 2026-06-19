import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import Hls from "hls.js";
import { Maximize, Minimize, X, ChevronLeft, ChevronRight, Menu, AlertCircle, Tv, RefreshCw } from "lucide-react";

type Channel = {
  id: number;
  name: string;
  category: string;
  logo?: string;
  stream: string;
  featured?: boolean;
  description?: string;
};

const CHANNELS_JSON_URL =
  "https://raw.githubusercontent.com/ismmaph-rgb/Buco-Tv/main/artifacts/api-server/data/channels.json";

function getDirectStreamUrl(channel?: Channel | null): string {
  return channel?.stream?.trim() ?? "";
}

function getStreamErrorMessage(streamUrl: string): string {
  if (!streamUrl) return "Este canal no tiene URL de transmisión configurada.";

  if (window.location.protocol === "https:" && streamUrl.startsWith("http://")) {
    return "Este canal usa HTTP y puede ser bloqueado por el navegador en una web HTTPS. Usá un enlace HTTPS o un proxy.";
  }

  return "Error de red desconocido";
}

export function Player() {
  const [, params] = useRoute("/player/:id");
  const [, setLocation] = useLocation();
  const channelId = params?.id ? parseInt(params.id) : 0;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimeoutRef = useRef<number>();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const currentIndex = channels.findIndex((c) => c.id === channelId);
  const prevChannel = currentIndex > 0 ? channels[currentIndex - 1] : channels[channels.length - 1];
  const nextChannel =
    currentIndex !== -1 && currentIndex < channels.length - 1
      ? channels[currentIndex + 1]
      : channels[0];

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadChannels() {
      try {
        const response = await fetch(`${CHANNELS_JSON_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`No se pudo cargar channels.json (${response.status})`);
        }

        const data = (await response.json()) as Channel[];

        if (cancelled) return;

        setChannels(data);
        setChannel(data.find((c) => c.id === channelId) ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar la lista de canales.");
        setIsLoading(false);
      }
    }

    loadChannels();

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const loadCurrentStream = useCallback(() => {
    const video = videoRef.current;
    const streamUrl = getDirectStreamUrl(channel);

    destroyHls();
    setError(null);
    setIsPlaying(false);
    setIsLoading(true);

    if (!video) return;

    video.removeAttribute("src");
    video.load();

    console.log("Playing channel", channel?.id, channel?.name, streamUrl);

    if (!streamUrl) {
      setIsLoading(false);
      setError("Este canal no tiene URL de transmisión configurada.");
      return;
    }

    const lowerUrl = streamUrl.toLowerCase();

    if (lowerUrl.includes(".m3u8") && Hls.isSupported()) {
  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,

    backBufferLength: 90,
    maxBufferLength: 60,
    maxMaxBufferLength: 120,

    manifestLoadingTimeOut: 30000,
    manifestLoadingMaxRetry: 8,
    manifestLoadingRetryDelay: 1000,

    levelLoadingTimeOut: 30000,
    levelLoadingMaxRetry: 8,
    levelLoadingRetryDelay: 1000,

    fragLoadingTimeOut: 30000,
    fragLoadingMaxRetry: 12,
    fragLoadingRetryDelay: 1000,

    startFragPrefetch: true,
  });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        setIsLoading(false);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setError(getStreamErrorMessage(streamUrl));
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setError("Formato de video no compatible con este navegador.");
        } else {
          setError("Error al cargar la transmisión. El canal puede estar caído o bloqueado.");
        }

        destroyHls();
      });

      return;
    }

    if (lowerUrl.includes(".m3u8") && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener(
        "loadedmetadata",
        () => {
          setIsLoading(false);
          video.play().catch(() => {});
        },
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          setIsLoading(false);
          setError(getStreamErrorMessage(streamUrl));
        },
        { once: true }
      );
      return;
    }

    video.src = streamUrl;
    video.addEventListener(
      "loadedmetadata",
      () => {
        setIsLoading(false);
        video.play().catch(() => {});
      },
      { once: true }
    );
    video.addEventListener(
      "error",
      () => {
        setIsLoading(false);
        setError(getStreamErrorMessage(streamUrl));
      },
      { once: true }
    );
  }, [channel, destroyHls]);

  useEffect(() => {
    if (!channelId || !channel) return;
    loadCurrentStream();

    return destroyHls;
  }, [channelId, channel, loadCurrentStream, destroyHls]);

  const triggerControls = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    triggerControls();
    return () => {
      if (hideControlsTimeoutRef.current) window.clearTimeout(hideControlsTimeoutRef.current);
    };
  }, [showGuide, triggerControls]);

  useEffect(() => {
    if (showGuide && hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current);
      setShowControls(true);
    }
  }, [showGuide]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      triggerControls();
      switch (e.key) {
        case "ArrowRight":
          if (nextChannel) setLocation(`/player/${nextChannel.id}`);
          break;
        case "ArrowLeft":
          if (prevChannel) setLocation(`/player/${prevChannel.id}`);
          break;
        case "Escape":
          if (showGuide) setShowGuide(false);
          else setLocation("/live");
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChannel, prevChannel, showGuide, triggerControls, toggleFullscreen, setLocation]);

  if (!channelId) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-[100] flex items-center justify-center overflow-hidden font-sans"
      onMouseMove={triggerControls}
      onClick={triggerControls}
    >
      <video
  ref={videoRef}
  className="w-full h-full object-contain"
  autoPlay
  playsInline
  onPlay={() => {
    setIsPlaying(true);
    setIsLoading(false);
  }}
  onPause={() => setIsPlaying(false)}
  onWaiting={() => {
    setTimeout(() => {
      videoRef.current?.play().catch(() => {});
    }, 2000);
  }}
  onPlaying={() => setIsLoading(false)}
/>

      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <span className="w-12 h-12 rounded-full border-4 border-white/20 border-t-primary animate-spin" />
            <p className="text-white/80 font-medium">Conectando a {channel?.name ?? "canal"}...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-20 p-4">
          <div className="text-center p-8 bg-zinc-900/90 border border-white/10 rounded-2xl backdrop-blur-md max-w-lg w-full">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Transmisión no disponible</h3>
            <p className="text-white/70 mb-3 text-sm leading-relaxed">{error}</p>

            {channel?.stream && (
              <div className="text-left bg-black/40 rounded-xl p-4 mb-5 text-xs font-mono space-y-1 border border-white/5">
                <div className="truncate">
                  <span className="text-white/40">url:</span>{" "}
                  <span className="text-white/60">{channel.stream}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={loadCurrentStream}
                className="px-5 py-2 bg-primary text-black font-bold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Reintentar
              </button>
              <button
                onClick={() => setLocation("/live")}
                className="px-5 py-2 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors"
              >
                Volver a la Guía
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`absolute top-0 inset-x-0 p-5 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 z-30 flex justify-between items-start ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/live")}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          {channel && (
            <div>
              <h2 className="text-lg font-bold text-white drop-shadow-md">{channel.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  EN VIVO
                </span>
                <span className="text-xs text-white/70">{channel.category}</span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowGuide(!showGuide)}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 backdrop-blur-md transition-colors ${showGuide ? "bg-primary text-black" : "bg-white/10 text-white hover:bg-white/20"}`}
        >
          <Menu className="w-5 h-5" />
          <span className="hidden sm:inline">Guía</span>
        </button>
      </div>

      <div
        className={`absolute inset-y-0 inset-x-0 flex items-center justify-between px-4 sm:px-12 pointer-events-none z-20 transition-opacity duration-300 ${showControls && !showGuide ? "opacity-100" : "opacity-0"}`}
      >
        {prevChannel ? (
          <button
            onClick={() => setLocation(`/player/${prevChannel.id}`)}
            className="w-14 h-14 rounded-full bg-black/40 hover:bg-primary border border-white/10 hover:border-primary flex items-center justify-center text-white backdrop-blur-md pointer-events-auto transition-all hover:scale-110 group"
          >
            <ChevronLeft className="w-8 h-8 group-hover:text-black" />
          </button>
        ) : (
          <div />
        )}

        {nextChannel ? (
          <button
            onClick={() => setLocation(`/player/${nextChannel.id}`)}
            className="w-14 h-14 rounded-full bg-black/40 hover:bg-primary border border-white/10 hover:border-primary flex items-center justify-center text-white backdrop-blur-md pointer-events-auto transition-all hover:scale-110 group"
          >
            <ChevronRight className="w-8 h-8 group-hover:text-black" />
          </button>
        ) : (
          <div />
        )}
      </div>

      <div
        className={`absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 z-30 flex justify-end ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <button
          onClick={toggleFullscreen}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-colors"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      <div
        className={`absolute top-0 right-0 bottom-0 w-80 bg-black/90 border-l border-white/10 backdrop-blur-xl z-40 transform transition-transform duration-300 flex flex-col ${showGuide ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <Tv className="w-5 h-5 text-primary" />
            Guía de Canales
          </h3>
          <button
            onClick={() => setShowGuide(false)}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                if (c.id !== channelId) setLocation(`/player/${c.id}`);
                setShowGuide(false);
              }}
              className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ${c.id === channelId ? "bg-primary/20 border border-primary/30" : "hover:bg-white/5 border border-transparent"}`}
            >
              <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center flex-shrink-0 p-1">
                {c.logo ? (
                  <img src={c.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="font-bold text-xs">{c.name.substring(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm truncate ${c.id === channelId ? "text-primary" : "text-white"}`}>
                  {c.name}
                </div>
                <div className="text-xs text-white/50 truncate">{c.category}</div>
              </div>
              {c.id === channelId && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
