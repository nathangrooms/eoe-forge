import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PowerLevelFlagsProps {
  flags: {
    no_tutors: boolean;
    no_game_changers: boolean;
  };
  diagnostics: {
    tutors: {
      count_quality: number;
      count_raw: number;
      list: Array<{name: string; quality: string; mv: number}>;
    };
    game_changers: {
      count: number;
      classes: {
        compact_combo: number;
        finisher_bombs: number;
        inevitability_engines: number;
        massive_swing: number;
      };
      list: Array<{name: string; class: string; reason: string}>;
    };
  };
  targetPower: number;
}

export function PowerLevelFlags({ flags, diagnostics, targetPower }: PowerLevelFlagsProps) {
  if (!flags.no_tutors && !flags.no_game_changers) return null;

  const tutorThreshold = targetPower >= 9 ? 6.0 : (targetPower >= 7 ? 3.0 : 1.5);
  const gcThreshold = targetPower >= 7 ? 2 : 1;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {flags.no_tutors && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="flex items-center gap-1 cursor-help">
                <AlertCircle className="h-3 w-3" />
                No Tutors
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-semibold mb-1">Tutor Quality: {diagnostics.tutors.count_quality.toFixed(1)} / {tutorThreshold}</p>
              <p className="text-xs text-muted-foreground mb-2">
                Found {diagnostics.tutors.count_raw} tutor(s), but quality-weighted score is below target for this power level.
              </p>
              {diagnostics.tutors.list.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium mb-1">Current tutors:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {diagnostics.tutors.list.slice(0, 5).map((t, i) => (
                      <li key={i}>{t.name} ({t.quality})</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs mt-2 text-muted-foreground">
                Add high-quality tutors like Demonic Tutor, Vampiric Tutor, or Mystical Tutor.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {flags.no_game_changers && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="flex items-center gap-1 cursor-help">
                <AlertCircle className="h-3 w-3" />
                No Game Changers
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-semibold mb-1">Game Changers: {diagnostics.game_changers.count} / {gcThreshold}</p>
              <p className="text-xs text-muted-foreground mb-2">
                Deck lacks efficient win conditions or game-ending threats for this power level.
              </p>
              <div className="text-xs space-y-1 mb-2">
                <p>Found:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Compact combos: {diagnostics.game_changers.classes.compact_combo}</li>
                  <li>Finisher bombs: {diagnostics.game_changers.classes.finisher_bombs}</li>
                  <li>Inevitability engines: {diagnostics.game_changers.classes.inevitability_engines}</li>
                  <li>Massive swings: {diagnostics.game_changers.classes.massive_swing}</li>
                </ul>
              </div>
              {diagnostics.game_changers.list.length > 0 && (
                <div className="text-xs mb-2">
                  <p className="font-medium mb-1">Current win conditions:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {diagnostics.game_changers.list.slice(0, 3).map((gc, i) => (
                      <li key={i}>{gc.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {targetPower >= 9 
                  ? "Add compact combos like Thassa's Oracle + Consultation or efficient win lines."
                  : "Add finishers like Craterhoof Behemoth or inevitability engines like Rhystic Study."}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
