import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * `StandardDeckTile` used to live here: an unreferenced deck tile carrying its
 * own `powerLevel: number` prop and a `PowerLevelBadge`, i.e. a sixth way to
 * render a deck's power, with raw blue/purple/green/yellow format colours the
 * monochrome palette does not allow. Deleted rather than restyled — the real
 * tile is `@/components/deck/DeckTile` and the only power renderer is
 * `@/components/deck/PowerScore`.
 */


interface StandardSectionHeaderProps {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function StandardSectionHeader({ title, description, action, className }: StandardSectionHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 md:mb-6", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}