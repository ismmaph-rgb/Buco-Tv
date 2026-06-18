import { Play } from "lucide-react";
import { Link } from "wouter";
import { Channel } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

interface ChannelCardProps {
  channel: Channel;
  className?: string;
}

export function ChannelCard({ channel, className = "" }: ChannelCardProps) {
  return (
    <Link href={`/player/${channel.id}`}>
      <div className={`group relative rounded-xl overflow-hidden bg-card border border-card-border transition-all hover:border-primary/50 hover:scale-[1.02] cursor-pointer ${className}`}>
        <div className="aspect-video bg-secondary relative overflow-hidden flex items-center justify-center p-4">
          {channel.logo ? (
            <img 
              src={channel.logo} 
              alt={channel.name} 
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg border border-white/5">
              <span className="text-2xl font-bold text-white/80">{channel.name.substring(0, 2).toUpperCase()}</span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-black transform scale-75 group-hover:scale-100 transition-transform">
              <Play className="w-5 h-5 ml-1" fill="currentColor" />
            </div>
          </div>
        </div>

        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-sm truncate text-white">{channel.name}</h3>
            {channel.featured && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30 h-4">
                TOP
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate">{channel.category}</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-medium text-red-500 tracking-wider">EN VIVO</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ChannelCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-card-border animate-pulse">
      <div className="aspect-video bg-white/5" />
      <div className="p-3">
        <div className="h-4 bg-white/10 rounded w-2/3 mb-2" />
        <div className="flex justify-between">
          <div className="h-3 bg-white/5 rounded w-1/3" />
          <div className="h-3 bg-white/5 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}