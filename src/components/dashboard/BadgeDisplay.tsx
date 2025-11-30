import { Badge as BadgeIcon, Trophy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BadgeProgress } from '@/lib/badges';

interface BadgeDisplayProps {
  badgeProgress: BadgeProgress;
  showProgress?: boolean;
}

export const BadgeDisplayCard = ({ badgeProgress, showProgress = false }: BadgeDisplayProps) => {
  const { badge, earned, progress, currentValue } = badgeProgress;
  
  const tierColors = {
    bronze: 'from-amber-700 to-amber-900',
    silver: 'from-gray-400 to-gray-600',
    gold: 'from-yellow-400 to-yellow-600',
    platinum: 'from-cyan-300 to-cyan-500',
  };

  const tierBgColors = {
    bronze: 'bg-amber-950/20',
    silver: 'bg-gray-950/20',
    gold: 'bg-yellow-950/20',
    platinum: 'bg-cyan-950/20',
  };

  return (
    <Card className={`relative overflow-hidden ${!earned && 'opacity-60'}`}>
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tierColors[badge.tier]}`} />
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-3 rounded-lg ${tierBgColors[badge.tier]} flex-shrink-0`}>
            <span className="text-2xl">{badge.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm truncate">{badge.name}</h4>
              {earned && <Trophy className="h-4 w-4 text-station flex-shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mb-2">{badge.description}</p>
            
            {showProgress && !earned && (
              <div className="space-y-1">
                <Progress value={progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {currentValue.toLocaleString()} / {badge.requirement.toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface BadgesSectionProps {
  earnedBadges: BadgeProgress[];
  inProgressBadges: BadgeProgress[];
}

export const BadgesSection = ({ earnedBadges, inProgressBadges }: BadgesSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BadgeIcon className="h-5 w-5 text-station" />
              Planeswalker Badges
            </CardTitle>
            <CardDescription>Track your achievements and unlock rewards</CardDescription>
          </div>
          <Badge variant="secondary" className="bg-spacecraft/20 text-spacecraft">
            {earnedBadges.length} Earned
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Earned Badges */}
        {earnedBadges.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-station" />
              Earned Badges
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {earnedBadges.map((bp) => (
                <BadgeDisplayCard key={bp.badge.id} badgeProgress={bp} />
              ))}
            </div>
          </div>
        )}

        {/* In Progress Badges */}
        {inProgressBadges.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3">Next Milestones</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {inProgressBadges.map((bp) => (
                <BadgeDisplayCard key={bp.badge.id} badgeProgress={bp} showProgress />
              ))}
            </div>
          </div>
        )}

        {earnedBadges.length === 0 && inProgressBadges.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <BadgeIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-medium mb-2">No Badges Yet</h3>
            <p className="text-sm text-muted-foreground">
              Start building decks and collecting cards to earn badges!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
