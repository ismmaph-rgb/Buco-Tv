import { Link, useLocation } from "wouter";
import { Search, Tv, FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/live?search=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-primary font-bold text-2xl tracking-tighter">
            <span className="bg-primary text-black px-2 py-0.5 rounded-sm">BUCO</span>
            <span>TV</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/">
              <span className={`text-sm font-medium transition-colors hover:text-white ${location === '/' ? 'text-white' : 'text-white/60'}`}>
                Inicio
              </span>
            </Link>
            <Link href="/live">
              <span className={`text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5 ${location.startsWith('/live') ? 'text-white' : 'text-white/60'}`}>
                <Tv className="w-4 h-4" />
                TV en Vivo
              </span>
            </Link>
            <Link href="/debug">
              <span className={`text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5 ${location.startsWith('/debug') ? 'text-white' : 'text-white/60'}`}>
                <FlaskConical className="w-4 h-4" />
                Auditoría
              </span>
            </Link>
          </nav>
        </div>

        <form onSubmit={handleSearch} className="relative hidden sm:block max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canales..." 
            className="w-full bg-white/5 border-white/10 pl-9 focus-visible:ring-primary text-sm h-10"
          />
        </form>
      </div>
    </header>
  );
}
