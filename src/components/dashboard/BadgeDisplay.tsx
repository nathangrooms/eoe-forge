import { DollarSign, Layers, Library, Swords, Trophy, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Badge as BadgeDef, BadgeProgress } from '@/lib/badges';
import { cn } from '@/lib/utils';

// Badges are earned against real collection/deck counts, so the tier is
// expressed typographically rather than with metallic gradients.
const CATEGORY_ICONS: Record<BadgeDef['category'], LucideIcon> = {
  deck_master: Layers,
  collector: Library,
  investor: DollarSign,
  strategist: Swords,
};

interface BadgeDisplayProps {
  badgeProgress: BadgeProgress;
  showProgress?: boolean;
}

export const BadgeDisplayCard = ({ badgeProgress, showProgress = false }: BadgeDisplayProps) => {
  const { badge, earned, progress, currentValue } = badgeProgress;
  const Icon = CATEGORY_ICONS[badge.category] ?? Trophy;

  return (
    <div
      className={cn(
        'flex h-full gap-3 rounded-lg border p-3',
        earned ? 'border-foreground/25 bg-card' : 'border-border bg-card'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
          earned
            ? 'border-transparent bg-primary text-primary-foreground'
            : 'border-border bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h4
            className={cn(
              'truncate text-sm font-medium',
              earned ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {badge.name}
          </h4>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge.tier}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{badge.description}</p>

        {showProgress && !earned && (
          <div className="mt-2 space-y-1">
            <Progress value={progress} className="h-1" />
            <p className="text-xs tabular-nums text-muted-foreground">
              {Math.round(currentValue).toLocaleString()} / {badge.requirement.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

interface BadgesSectionProps {
  earnedBadges: BadgeProgress[];
  inProgressBadges: BadgeProgress[];
}

export const BadgesSection = ({ earnedBadges, inProgressBadges }: BadgesSectionProps) => {
  const hasAny = earnedBadges.length > 0 || inProgressBadges.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base font-semibold">Milestones</CardTitle>
        <span className="text-xs tabular-nums text-muted-foreground">
          {earnedBadges.length} earned
        </span>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {earnedBadges.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 border-t border-border pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              Earned
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {earnedBadges.map(bp => (
                <BadgeDisplayCard key={bp.badge.id} badgeProgress={bp} />
              ))}
            </div>
          </section>
        )}

        {inProgressBadges.length > 0 && (
          <section>
            <h3 className="mb-2 border-t border-border pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Next up
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {inProgressBadges.map(bp => (
                <BadgeDisplayCard key={bp.badge.id} badgeProgress={bp} showProgress />
              ))}
            </div>
          </section>
        )}

        {!hasAny && (
          <p className="border-t border-border py-8 text-center text-sm text-muted-foreground">
            Milestones unlock as you add decks and cards.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
