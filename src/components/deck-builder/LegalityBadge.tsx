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

/**
 * Legality state. Illegal is the only case that earns colour — it is an error
 * signal, so it uses the destructive token; legal and unknown stay neutral.
 */
export function LegalityBadge({ isLegal, issues, format, className }: LegalityBadgeProps) {
  const hasIssues = issues && issues.length > 0;

  if (isLegal && !hasIssues) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={cn('gap-1', className)}>
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
              'gap-1',
              hasIssues
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'text-muted-foreground',
              className
            )}
          >
            {hasIssues ? (
              <>
                <XCircle className="h-3 w-3" />
                {issues.length} issue{issues.length !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3" />
                Check needed
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {hasIssues ? (
            <div className="space-y-1">
              <p className="font-medium">Legality issues</p>
              <ul className="space-y-0.5 text-xs">
                {issues.slice(0, 5).map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
                {issues.length > 5 && <li>…and {issues.length - 5} more</li>}
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
