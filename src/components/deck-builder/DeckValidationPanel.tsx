import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  ChevronDown,
  CheckCircle,
  Shield
} from 'lucide-react';
import { DeckValidator, ValidationWarning } from '@/lib/deckbuilder/validation-warnings';
import { DeckLegalityChecker, LegalityResult } from '@/lib/deckbuilder/legality-checker';
import { Card as DeckCard } from '@/stores/deckStore';

interface DeckValidationPanelProps {
  cards: DeckCard[];
  format: string;
  commander?: DeckCard;
}

export function DeckValidationPanel({ cards, format, commander }: DeckValidationPanelProps) {
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [legality, setLegality] = useState<LegalityResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['errors']));

  useEffect(() => {
    // Run validation
    const validationWarnings = DeckValidator.validate(cards, format, commander);
    setWarnings(validationWarnings);

    // Check legality
    const legalityResult = DeckLegalityChecker.checkDeck(cards, format, commander);
    setLegality(legalityResult);
  }, [cards, format, commander]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const errorWarnings = warnings.filter(w => w.severity === 'error');
  const warningWarnings = warnings.filter(w => w.severity === 'warning');
  const infoWarnings = warnings.filter(w => w.severity === 'info');

  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case 'info': return <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getSeverityBadge = (severity: 'error' | 'warning' | 'info') => {
    const colors = {
      error: 'bg-destructive/10 text-destructive border-destructive/20',
      warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
      info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    };
    
    return (
      <Badge variant="outline" className={colors[severity]}>
        {severity}
      </Badge>
    );
  };

  const renderWarningSection = (
    title: string,
    sectionKey: string,
    items: ValidationWarning[],
    icon: React.ReactNode
  ) => {
    if (items.length === 0) return null;

    return (
      <Collapsible
        open={expandedSections.has(sectionKey)}
        onOpenChange={() => toggleSection(sectionKey)}
      >
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-4 h-auto">
            <div className="flex items-center gap-3">
              {icon}
              <span className="font-semibold">{title}</span>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${
              expandedSections.has(sectionKey) ? 'transform rotate-180' : ''
            }`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 space-y-2">
          {items.map((warning, idx) => (
            <Alert key={idx} className="border-l-4" style={{
              borderLeftColor: warning.severity === 'error' ? 'hsl(var(--destructive))' :
                               warning.severity === 'warning' ? 'hsl(45 93% 47%)' :
                               'hsl(221 83% 53%)'
            }}>
              <div className="flex items-start gap-3">
                {getSeverityIcon(warning.severity)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{warning.message}</span>
                    {getSeverityBadge(warning.severity)}
                  </div>
                  {warning.suggestion && (
                    <AlertDescription className="text-sm text-muted-foreground">
                      💡 {warning.suggestion}
                    </AlertDescription>
                  )}
                  {warning.affectedCards && warning.affectedCards.length > 0 && (
                    <div className="text-xs text-muted-foreground pt-1">
                      Cards: {warning.affectedCards.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </Alert>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderLegalitySection = () => {
    if (!legality) return null;

    return (
      <Collapsible
        open={expandedSections.has('legality')}
        onOpenChange={() => toggleSection('legality')}
      >
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-4 h-auto">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4" />
              <span className="font-semibold">Format Legality</span>
              {legality.isLegal ? (
                <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                  Legal
                </Badge>
              ) : (
                <Badge variant="destructive">Illegal</Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${
              expandedSections.has('legality') ? 'transform rotate-180' : ''
            }`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 space-y-2">
          {legality.isLegal ? (
            <Alert className="border-green-500/20">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                This deck is legal in {format} format.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {legality.issues.map((issue, idx) => (
                <Alert key={idx} variant="destructive" className="border-l-4 border-l-destructive">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-4 w-4" />
                    <div className="flex-1">
                      <AlertDescription>{issue.message}</AlertDescription>
                      {issue.card && (
                        <div className="text-xs mt-1 opacity-80">Card: {issue.card}</div>
                      )}
                    </div>
                  </div>
                </Alert>
              ))}
            </>
          )}
          {legality.warnings.length > 0 && (
            <div className="pt-2">
              <p className="text-sm font-medium mb-2">Warnings:</p>
              {legality.warnings.map((warning, idx) => (
                <Alert key={idx} className="border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription>{warning.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const totalIssues = errorWarnings.length + (legality?.issues.length || 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Deck Validation
          </CardTitle>
          {totalIssues === 0 ? (
            <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
              <CheckCircle className="h-3 w-3 mr-1" />
              No Issues
            </Badge>
          ) : (
            <Badge variant="destructive">
              {totalIssues} {totalIssues === 1 ? 'Issue' : 'Issues'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {renderLegalitySection()}
        {renderWarningSection(
          'Errors',
          'errors',
          errorWarnings,
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        {renderWarningSection(
          'Warnings',
          'warnings',
          warningWarnings,
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        )}
        {renderWarningSection(
          'Suggestions',
          'info',
          infoWarnings,
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        )}
        
        {totalIssues === 0 && warnings.length === 0 && (
          <Alert className="border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              Your deck looks great! No validation issues found.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
