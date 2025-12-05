import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ManaSymbols, PowerLevelBadge } from "@/components/ui/mana-symbols";
import { cn } from "@/lib/utils";
import { Edit, Trash2, Copy, Eye, Play } from "lucide-react";

interface StandardDeckTileProps {
  name: string;
  format: string;
  colors: string[];
  cardCount: number;
  powerLevel: number;
  lastModified?: Date;
  description?: string;
  isLoading?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onView?: () => void;
  onPlay?: () => void;
  className?: string;
}

export function StandardDeckTile({
  name,
  format,
  colors,
  cardCount,
  powerLevel,
  lastModified,
  description,
  isLoading = false,
  onEdit,
  onDelete,
  onDuplicate,
  onView,
  onPlay,
  className
}: StandardDeckTileProps) {
  const formatColors = {
    standard: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    commander: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    modern: 'bg-green-500/20 text-green-400 border-green-500/30',
    legacy: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
            <div className="h-6 bg-muted rounded w-16" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1">
              <div className="h-4 w-4 bg-muted rounded-full" />
              <div className="h-4 w-4 bg-muted rounded-full" />
            </div>
            <div className="h-4 bg-muted rounded w-12" />
          </div>
          <div className="flex space-x-2">
            <div className="h-8 bg-muted rounded flex-1" />
            <div className="h-8 bg-muted rounded flex-1" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("group hover:shadow-lg transition-all duration-200", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate mb-1">
              {name}
            </CardTitle>
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {description}
              </p>
            )}
            {lastModified && (
              <p className="text-xs text-muted-foreground">
                Modified {lastModified.toLocaleDateString()}
              </p>
            )}
          </div>
          <Badge className={formatColors[format as keyof typeof formatColors] || formatColors.custom}>
            {cardCount} cards
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ManaSymbols colors={colors} />
            <span className="text-sm text-muted-foreground capitalize">
              {format}
            </span>
          </div>
          <PowerLevelBadge level={powerLevel} />
        </div>
        
        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {onView && (
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye className="h-3 w-3" />
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-3 w-3" />
            </Button>
          )}
          {onDuplicate && (
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <Copy className="h-3 w-3" />
            </Button>
          )}
          {onPlay && (
            <Button variant="outline" size="sm" onClick={onPlay}>
              <Play className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface StandardSectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function StandardSectionHeader({ title, description, action, className }: StandardSectionHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 md:mb-6", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl md:text-3xl font-bold bg-cosmic bg-clip-text text-transparent truncate">
          {title}
        </h1>
        {description && (
          <p className="text-sm md:text-base text-muted-foreground mt-1 line-clamp-2">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}