import { Navbar } from "@/components/layout/navbar";
import { ChannelCard, ChannelCardSkeleton } from "@/components/channel/channel-card";
import { Button } from "@/components/ui/button";
import { Play, Info } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

type Channel = {
  id: number;
  name: string;
  category: string;
  logo?: string;
  stream: string;
  featured?: boolean;
  description?: string;
};

const CHANNELS_URL =
  "https://raw.githubusercontent.com/ismmaph-rgb/Buco-Tv/main/artifacts/api-server/data/channels.json";

export function Home() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);

  useEffect(() => {
    async function loadChannels() {
      try {
        setLoadingChannels(true);

        const response = await fetch(`${CHANNELS_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status} cargando canales`);
        }

        const data = await response.json();
        setChannels(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error cargando canales:", error);
        setChannels([]);
      } finally {
        setLoadingChannels(false);
      }
    }

    loadChannels();
  }, []);

  const categories = Array.from(
    new Set(channels.map((channel) => channel.category).filter(Boolean))
  );

  const featured = channels.filter((channel) => channel.featured);
  const topChannel = featured[0] || channels[0];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <Navbar />

      <main>
        <section className="relative h-[60vh] min-h-[500px] w-full bg-black mb-12 border-b border-white/10">
          {topChannel ? (
            <>
              <div className="absolute inset-0">
                {topChannel.logo ? (
                  <img
                    src={topChannel.logo}
                    className="w-full h-full object-cover opacity-30 blur-sm scale-105"
                    alt=""
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-primary/20 to-black" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
              </div>

              <div className="relative container mx-auto px-4 h-full flex flex-col justify-end pb-16">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex items-center gap-1.5 bg-red-500/20 text-red-500 text-xs font-bold px-2 py-1 rounded border border-red-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      EN VIVO
                    </span>
                    <span className="text-sm font-medium text-white/60">{topChannel.category}</span>
                  </div>

                  <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
                    {topChannel.name}
                  </h1>

                  {topChannel.description && (
                    <p className="text-lg text-white/70 mb-8 line-clamp-2">
                      {topChannel.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4">
                    <Link href={`/player/${topChannel.id}`}>
                      <Button size="lg" className="bg-white text-black hover:bg-white/90 font-bold px-8 h-12 rounded-full">
                        <Play className="w-5 h-5 mr-2" fill="currentColor" />
                        Reproducir
                      </Button>
                    </Link>
                    <Button size="lg" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white font-semibold h-12 rounded-full px-6">
                      <Info className="w-5 h-5 mr-2" />
                      Más Info
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : loadingChannels ? (
            <div className="w-full h-full bg-secondary animate-pulse" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50">
              No se encontraron canales
            </div>
          )}
        </section>

        <div className="container mx-auto px-4 space-y-12">
          {featured.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                Canales Destacados
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {featured.slice(0, 6).map((channel) => (
                  <ChannelCard key={channel.id} channel={channel} />
                ))}
              </div>
            </section>
          )}

          {!loadingChannels &&
            categories.map((category) => {
              const categoryChannels = channels.filter((c) => c.category === category);
              if (categoryChannels.length === 0) return null;

              return (
                <section key={category}>
                  <div className="flex items-end justify-between mb-4">
                    <h2 className="text-xl font-semibold">{category}</h2>
                    <Link href={`/live?category=${encodeURIComponent(category)}`}>
                      <span className="text-sm text-primary hover:underline cursor-pointer">Ver todos</span>
                    </Link>
                  </div>

                  <div className="flex overflow-x-auto pb-4 -mx-4 px-4 gap-4 snap-x hide-scrollbar">
                    {categoryChannels.map((channel) => (
                      <div
                        key={channel.id}
                        className="min-w-[240px] sm:min-w-[280px] w-[240px] sm:w-[280px] flex-shrink-0 snap-start"
                      >
                        <ChannelCard channel={channel} />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

          {loadingChannels && (
            <div className="space-y-8">
              {[1, 2].map((i) => (
                <section key={i}>
                  <div className="h-6 bg-white/10 rounded w-48 mb-4 animate-pulse" />
                  <div className="flex gap-4 overflow-hidden">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div key={j} className="min-w-[240px] flex-shrink-0">
                        <ChannelCardSkeleton />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}