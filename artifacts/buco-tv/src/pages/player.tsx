import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import Hls from "hls.js";
import { useGetChannel, useListChannels } from "@workspace/api-client-react";
import { Maximize, Minimize, X, ChevronLeft, ChevronRight, Menu, AlertCircle, Tv } from "lucide-react";

export function Player() {
  const [, params] = useRoute("/player/:id");
  const [, setLocation] = useLocation();
  const channelId = params?.id ? parseInt(params.id) : 0;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimeoutRef = useRef<number>();
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { data: channel, isLoading: loadingChannel } = useGetChannel(channelId, {
    query: { enabled: !!channelId }
  });
  const { data: channels = [] } = useListChannels();

  // Navigation
  const currentIndex = channels.findIndex(c => c.id === channelId);
  const prevChannel = currentIndex > 0 ? channels[currentIndex - 1] : channels[channels.length - 1];
  const nextChannel = currentIndex < channels.length - 1 && currentIndex !== -1 ? channels[currentIndex + 1] : channels[0];

  // Initialize player
  useEffect(() => {
    if (!channelId || !videoRef.current) return;

    setError(null);
    setIsPlaying(false);
    
    const streamUrl = `/api/stream/${channelId}`;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(e => {
          console.error("Auto-play prevented", e);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError("Error de red. Intenta nuevamente.");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Error de formato de video.");
              hls.recoverMediaError();
              break;
            default:
              setError("Error al cargar la transmisión.");
              hls.destroy();
              break;
          }
        }
      });
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      // For Safari
      videoRef.current.src = streamUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        videoRef.current?.play().catch(e => console.error(e));
      });
    } else {
      setError("Tu navegador no soporta HLS.");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channelId]);

  // Controls auto-hide
  const triggerControls = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      if (!showGuide) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    triggerControls();
    return () => {
      if (hideControlsTimeoutRef.current) window.clearTimeout(hideControlsTimeoutRef.current);
    };
  }, [showGuide]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      triggerControls();
      if (e.key === "ArrowRight") {
        if (nextChannel) setLocation(`/player/${nextChannel.id}`);
      } else if (e.key === "ArrowLeft") {
        if (prevChannel) setLocation(`/player/${prevChannel.id}`);
      } else if (e.key === "Escape") {
        if (showGuide) setShowGuide(false);
        else setLocation("/live");
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChannel, prevChannel, showGuide, setLocation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Loading state */}
      {(!isPlaying && !error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 pointer-events-none">
          <div className="flex flex-col items-center">
            <span className="w-12 h-12 rounded-full border-4 border-white/20 border-t-primary animate-spin mb-4" />
            <p className="text-white/80 font-medium">Conectando a {channel?.name}...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center p-8 bg-card/80 border border-white/10 rounded-2xl backdrop-blur-md max-w-md">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Transmisión no disponible</h3>
            <p className="text-white/60 mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-primary text-black font-bold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Reintentar
              </button>
              <button 
                onClick={() => setLocation("/live")}
                className="px-6 py-2 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors"
              >
                Volver a la Guía
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top overlay */}
      <div 
        className={`absolute top-0 inset-x-0 p-6 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 z-30 flex justify-between items-start ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLocation("/live")}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          {channel && (
            <div>
              <h2 className="text-xl font-bold text-white shadow-sm drop-shadow-md">{channel.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex items-center gap-1.5 bg-red-500/20 text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500/30">
                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                  EN VIVO
                </span>
                <span className="text-xs font-medium text-white/80 shadow-sm drop-shadow-md">{channel.category}</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowGuide(!showGuide)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 backdrop-blur-md transition-colors ${showGuide ? 'bg-primary text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            <Menu className="w-5 h-5" />
            <span className="hidden sm:inline">Guía</span>
          </button>
        </div>
      </div>

      {/* Middle Channel Navigation */}
      <div className={`absolute inset-y-0 inset-x-0 flex items-center justify-between px-4 sm:px-12 pointer-events-none z-20 transition-opacity duration-300 ${showControls && !showGuide ? 'opacity-100' : 'opacity-0'}`}>
        {prevChannel ? (
          <button 
            onClick={() => setLocation(`/player/${prevChannel.id}`)}
            className="w-14 h-14 rounded-full bg-black/40 hover:bg-primary border border-white/10 hover:border-primary flex items-center justify-center text-white backdrop-blur-md pointer-events-auto transition-all transform hover:scale-110 group"
          >
            <ChevronLeft className="w-8 h-8 group-hover:text-black" />
            <span className="sr-only">Canal Anterior</span>
          </button>
        ) : <div />}
        
        {nextChannel ? (
          <button 
            onClick={() => setLocation(`/player/${nextChannel.id}`)}
            className="w-14 h-14 rounded-full bg-black/40 hover:bg-primary border border-white/10 hover:border-primary flex items-center justify-center text-white backdrop-blur-md pointer-events-auto transition-all transform hover:scale-110 group"
          >
            <ChevronRight className="w-8 h-8 group-hover:text-black" />
            <span className="sr-only">Siguiente Canal</span>
          </button>
        ) : <div />}
      </div>

      {/* Bottom overlay */}
      <div 
        className={`absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 z-30 flex justify-end ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        <button 
          onClick={toggleFullscreen}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-colors"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      {/* Side Guide Panel */}
      <div 
        className={`absolute top-0 right-0 bottom-0 w-80 bg-black/90 border-l border-white/10 backdrop-blur-xl z-40 transform transition-transform duration-300 flex flex-col ${showGuide ? 'translate-x-0' : 'translate-x-full'}`}
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
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {channels.map(c => (
            <button
              key={c.id}
              onClick={() => {
                if (c.id !== channelId) {
                  setLocation(`/player/${c.id}`);
                }
                setShowGuide(false);
              }}
              className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ${c.id === channelId ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5 border border-transparent'}`}
            >
              <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center flex-shrink-0 p-1">
                {c.logo ? (
                  <img src={c.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="font-bold text-xs">{c.name.substring(0,2)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm truncate ${c.id === channelId ? 'text-primary' : 'text-white'}`}>{c.name}</div>
                <div className="text-xs text-white/50 truncate">{c.category}</div>
              </div>
              {c.id === channelId && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}