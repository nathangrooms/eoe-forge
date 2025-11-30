import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  CheckCircle, 
  Info,
  X 
} from 'lucide-react';

interface SimpleCard {
  id: string;
  name: string;
  color_identity?: string[];
  colors?: string[];
}

interface ColorViolation {
  cardName: string;
  cardId: string;
  cardColors: string[];
  invalidColors: string[];
  reason: string;
}

interface DeckCompatibilityCheckerProps {
  cards: SimpleCard[];
  commander?: SimpleCard;
  format: string;
  onRemoveCard?: (cardId: string) => void;
}

function checkColorIdentityCompatibility(
  cardColorIdentity: string[],
  commanderColorIdentity: string[]
): { compatible: boolean; invalidColors: string[] } {
  const invalidColors = cardColorIdentity.filter(
    color => !commanderColorIdentity.includes(color)
  );
  
  return {
    compatible: invalidColors.length === 0,
    invalidColors
  };
}

function checkDeckColorCompatibility(
  deck: SimpleCard[],
  commander?: SimpleCard,
  format: string = 'commander'
) {
  if (format !== 'commander' || !commander) {
    return {
      isCompatible: true,
      violations: [],
      commanderIdentity: [],
      deckColors: []
    };
  }

  const commanderIdentity = commander.color_identity || [];
  const violations: ColorViolation[] = [];
  const deckColorSet = new Set<string>();

  deck.forEach(card => {
    const cardIdentity = card.color_identity || [];
    
    cardIdentity.forEach(color => deckColorSet.add(color));

    const { compatible, invalidColors } = checkColorIdentityCompatibility(
      cardIdentity,
      commanderIdentity
    );

    if (!compatible) {
      violations.push({
        cardName: card.name,
        cardId: card.id,
        cardColors: cardIdentity,
        invalidColors,
        reason: `Card has ${invalidColors.join(', ')} in its identity, which is not in commander's identity (${commanderIdentity.join(', ')})`
      });
    }
  });

  return {
    isCompatible: violations.length === 0,
    violations,
    commanderIdentity,
    deckColors: Array.from(deckColorSet).sort()
  };
}

function formatColorIdentity(colors: string[]): string {
  if (!colors || colors.length === 0) return 'Colorless';
  return colors.map(getColorName).join(', ');
}

export function DeckCompatibilityChecker({ 
  cards, 
  commander, 
  format,
  onRemoveCard 
}: DeckCompatibilityCheckerProps) {
  const [compatibilityResult, setCompatibilityResult] = useState<any>(null);

  useEffect(() => {
    if (format === 'commander' && commander) {
      const result = checkDeckColorCompatibility(
        cards.filter(c => c.id !== commander.id),
        commander,
        format
      );
      setCompatibilityResult(result);
    } else {
      setCompatibilityResult({
        isCompatible: true,
        violations: [],
        commanderIdentity: [],
        deckColors: []
      });
    }
  }, [cards, commander, format]);

  if (!compatibilityResult) return null;

  // Only show for commander format
  if (format !== 'commander' || !commander) return null;

  const { isCompatible, violations, commanderIdentity, deckColors } = compatibilityResult;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {isCompatible ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            Color Identity Check
          </span>
          <Badge variant={isCompatible ? "secondary" : "destructive"}>
            {isCompatible ? 'Compatible' : `${violations.length} Issue${violations.length !== 1 ? 's' : ''}`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Commander Identity</p>
            <p className="text-sm">
              {formatColorIdentity(commanderIdentity)}
            </p>
            <div className="flex gap-1 mt-1">
              {commanderIdentity.map(color => (
                <div
                  key={color}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getColorClass(color)}`}
                >
                  {color}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Deck Colors</p>
            <p className="text-sm">
              {formatColorIdentity(deckColors)}
            </p>
            <div className="flex gap-1 mt-1">
              {deckColors.map(color => (
                <div
                  key={color}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getColorClass(color)} ${
                    !commanderIdentity.includes(color) ? 'ring-2 ring-destructive' : ''
                  }`}
                >
                  {color}
                </div>
              ))}
            </div>
          </div>
        </div>

        {isCompatible ? (
          <Alert className="border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              All cards in your deck match your commander's color identity.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {violations.length} {violations.length === 1 ? 'card has' : 'cards have'} colors outside your commander's identity.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm font-medium">Incompatible Cards:</p>
              {violations.map((violation: any) => (
                <div
                  key={violation.cardId}
                  className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5"
                >
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{violation.cardName}</p>
                    <p className="text-xs text-muted-foreground">
                      Invalid colors: {violation.invalidColors.map(getColorName).join(', ')}
                    </p>
                  </div>
                  {onRemoveCard && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveCard(violation.cardId)}
                      className="ml-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                In Commander, all cards must match your commander's color identity. Remove the incompatible cards or choose a different commander.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function getColorClass(color: string): string {
  const colorClasses: Record<string, string> = {
    W: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
    U: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
    B: 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
    R: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
    G: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100',
    C: 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
  };
  
  return colorClasses[color] || colorClasses.C;
}

function getColorName(color: string): string {
  const colorNames: Record<string, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
    C: 'Colorless'
  };
  
  return colorNames[color] || color;
}
