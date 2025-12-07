// Premium card display component for optimizer with hover effects and animations
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Package, TrendingDown, TrendingUp, Info, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface OptimizerCardProps {
  name: string;
  image: string;
  price: number;
  reason?: string;
  type?: 'remove' | 'add' | 'neutral';
  playability?: number | null;
  inCollection?: boolean;
  tags?: string[];
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function OptimizerCard({
  name,
  image,
  price,
  reason,
  type = 'neutral',
  playability,
  inCollection,
  tags = [],
  className,
  size = 'md',
  onClick
}: OptimizerCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const sizeClasses = {
    sm: 'w-24',
    md: 'w-36',
    lg: 'w-44'
  };

  const typeStyles = {
    remove: {
      border: 'border-destructive/40',
      glow: 'shadow-destructive/20',
      label: 'bg-destructive/20 text-destructive border-destructive/30',
      labelText: 'Remove'
    },
    add: {
      border: 'border-green-500/40',
      glow: 'shadow-green-500/20',
      label: 'bg-green-500/20 text-green-400 border-green-500/30',
      labelText: 'Add'
    },
    neutral: {
      border: 'border-border',
      glow: 'shadow-primary/10',
      label: 'bg-muted text-muted-foreground',
      labelText: ''
    }
  };

  const style = typeStyles[type];

  return (
    <motion.div
      className={cn(
        "relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300",
        style.border,
        isHovered && `shadow-xl ${style.glow}`,
        sizeClasses[size],
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {/* Card Image */}
      <div className="relative aspect-[0.714] overflow-hidden bg-muted">
        <img
          src={imageError ? '/placeholder.svg' : image}
          alt={name}
          className={cn(
            "w-full h-full object-cover transition-transform duration-300",
            isHovered && "scale-105"
          )}
          onError={() => setImageError(true)}
        />
        
        {/* Type Label Overlay */}
        {type !== 'neutral' && (
          <div className="absolute top-2 left-2">
            <Badge variant="outline" className={cn("text-xs font-semibold backdrop-blur-sm", style.label)}>
              {style.labelText}
            </Badge>
          </div>
        )}

        {/* Collection Badge */}
        {inCollection && (
          <div className="absolute top-2 right-2">
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30 backdrop-blur-sm">
                  <Package className="h-3 w-3" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>In your collection</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Playability Badge */}
        {playability !== null && playability !== undefined && (
          <div className="absolute bottom-2 left-2">
            <Tooltip>
              <TooltipTrigger>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs backdrop-blur-sm",
                    playability < 30 ? "bg-destructive/20 text-destructive border-destructive/30" :
                    playability < 50 ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                    "bg-green-500/20 text-green-400 border-green-500/30"
                  )}
                >
                  {playability < 50 ? <TrendingDown className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                  {playability}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent>EDH Playability Score</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Hover Overlay with Details */}
        {isHovered && reason && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-end p-3"
          >
            <p className="text-xs text-white/90 line-clamp-3">{reason}</p>
          </motion.div>
        )}
      </div>

      {/* Card Info Footer */}
      <div className="p-2 bg-card/95 backdrop-blur-sm border-t border-border/50">
        <p className="text-sm font-medium truncate mb-1">{name}</p>
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-xs font-semibold",
            price > 20 ? "text-amber-400" : "text-muted-foreground"
          )}>
            ${price.toFixed(2)}
          </span>
          {tags.length > 0 && (
            <div className="flex gap-1">
              {tags.slice(0, 2).map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0 h-4">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
