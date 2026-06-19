import { Navbar } from "@/components/layout/navbar";
import { ChannelCard, ChannelCardSkeleton } from "@/components/channel/channel-card";
import { useState, useEffect } from "react";
import { Tv, Search as SearchIcon, Hash, Star } from "lucide-react";
import { Input } from "@/components/ui/input";

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

export function Live() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialCategory = searchParams.get("category") || "Todos";
  const initialSearch = searchParams.get("search") || "";

  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadChannels() {
      try {
        setLoadingChannels(true);
        setError(null);

        const response = await fetch(`${CHANNELS_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status} cargando canales`);
        }

        const data = await response.json();
        setChannels(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error cargando channels.json:", err);
        setError("No se pudieron cargar los canales.");
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

  const stats = {
    total: channels.length,
    featured: channels.filter((channel) => channel.featured).length,
  };

  const categoryChannels =
    activeCategory !== "Todos"
      ? channels.filter((channel) => channel.category === activeCategory)
      : channels;

  const filteredChannels = categoryChannels.filter((channel) =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="container mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Tv className="w-8 h-8 text-primary" />
              TV en Vivo
            </h1>
            <p className="text-white/60">Todos tus canales favoritos en un solo lugar.</p>

            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Hash className="w-4 h-4" /> {stats.total} Canales
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="w-4 h-4" /> {stats.featured} Destacados
              </span>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal..."
              className="w-full bg-card border-card-border pl-9"
            />
          </div>
        </div>

        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 mb-8 gap-2 hide-scrollbar">
          <button
            onClick={() => setActiveCategory("Todos")}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === "Todos"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-card/80 hover:text-white border border-card-border"
            }`}
          >
            Todos
          </button>

          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-card/80 hover:text-white border border-card-border"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {loadingChannels ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <ChannelCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center border border-dashed border-white/10 rounded-2xl bg-card/30">
            <Tv className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{error}</h3>
            <p className="text-white/50">Revisá que el channels.json esté público y válido.</p>
          </div>
        ) : filteredChannels.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredChannels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-white/10 rounded-2xl bg-card/30">
            <Tv className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No se encontraron canales</h3>
            <p className="text-white/50 max-w-md mx-auto">
              No pudimos encontrar ningún canal que coincida con "{searchQuery}" en la categoría "{activeCategory}".
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("Todos");
              }}
              className="mt-6 text-primary hover:underline font-medium"
            >
              Ver todos los canales
            </button>
          </div>
        )}
      </main>
    </div>
  );
}