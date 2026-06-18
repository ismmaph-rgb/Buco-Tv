import { useListChannels, useListCategories, getListChannelsQueryKey, useGetChannelStats } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { ChannelCard, ChannelCardSkeleton } from "@/components/channel/channel-card";
import { useLocation } from "wouter";
import { useState } from "react";
import { Tv, Search as SearchIcon, Hash, Star } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Live() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialCategory = searchParams.get("category") || "Todos";
  const initialSearch = searchParams.get("search") || "";
  
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  
  const { data: categories = [], isLoading: loadingCategories } = useListCategories();
  const { data: stats } = useGetChannelStats();

  const queryParams = activeCategory !== "Todos" ? { category: activeCategory } : undefined;
  
  const { data: channels = [], isLoading: loadingChannels } = useListChannels(queryParams, {
    query: {
      queryKey: getListChannelsQueryKey(queryParams)
    }
  });

  // Client-side search filtering
  const filteredChannels = channels.filter(channel => {
    return channel.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

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
            {stats && (
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Hash className="w-4 h-4" /> {stats.total} Canales</span>
                <span className="flex items-center gap-1.5"><Star className="w-4 h-4" /> {stats.featured} Destacados</span>
              </div>
            )}
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

        {/* Categories Tab */}
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
          
          {!loadingCategories && categories.map(category => (
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
          
          {loadingCategories && (
            <>
              <div className="w-24 h-9 bg-white/5 rounded-full animate-pulse" />
              <div className="w-32 h-9 bg-white/5 rounded-full animate-pulse" />
              <div className="w-28 h-9 bg-white/5 rounded-full animate-pulse" />
            </>
          )}
        </div>

        {/* Channels Grid */}
        {loadingChannels ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <ChannelCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredChannels.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredChannels.map(channel => (
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
              onClick={() => { setSearchQuery(""); setActiveCategory("Todos"); }}
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