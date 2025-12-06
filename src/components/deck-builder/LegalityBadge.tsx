import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LegalityBadgeProps {
  isLegal: boolean;
  issues: string[];
  format: string;
  className?: string;
}

export function LegalityBadge({ isLegal, issues, format, className }: LegalityBadgeProps) {
  const hasIssues = issues && issues.length > 0;
  
  if (isLegal && !hasIssues) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "bg-green-500/10 text-green-600 border-green-500/30 gap-1",
                className
              )}
            >
              <CheckCircle className="h-3 w-3" />
              Legal
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This deck is legal in {format}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              hasIssues 
                ? "bg-red-500/10 text-red-600 border-red-500/30 gap-1" 
                : "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 gap-1",
              className
            )}
          >
            {hasIssues ? (
              <>
                <XCircle className="h-3 w-3" />
                {issues.length} Issue{issues.length !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3" />
                Check Needed
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {hasIssues ? (
            <div className="space-y-1">
              <p className="font-medium text-red-400">Legality Issues:</p>
              <ul className="text-xs space-y-0.5">
                {issues.slice(0, 5).map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
                {issues.length > 5 && (
                  <li className="text-muted-foreground">...and {issues.length - 5} more</li>
                )}
              </ul>
            </div>
          ) : (
            <p>Unable to verify legality for {format}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}