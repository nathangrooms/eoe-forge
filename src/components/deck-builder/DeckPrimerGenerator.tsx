import { useEffect, useState } from "react";
import { FIELD } from '@/components/listing';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BookOpen, ChevronDown, ChevronUp, Download } from "lucide-react";
import { toast } from "sonner";

interface DeckPrimerGeneratorProps {
  deckName: string;
  commander?: string;
  strategy?: string;
  cardCount: number;
  /**
   * Which deck this primer belongs to. Given, the four fields survive leaving
   * the tab. See the note on `draft` below.
   */
  deckId?: string;
}

/** The four fields, as they are held between visits. */
interface PrimerDraft {
  overview: string;
  winConditions: string;
  keyCards: string;
  gameplan: string;
}

const EMPTY: PrimerDraft = { overview: '', winConditions: '', keyCards: '', gameplan: '' };

const draftKey = (deckId: string) => `dm.deck-primer.${deckId}`;

function readDraft(deckId: string | undefined): PrimerDraft {
  if (!deckId) return EMPTY;
  try {
    const raw = localStorage.getItem(draftKey(deckId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PrimerDraft>;
    return {
      overview: typeof parsed.overview === 'string' ? parsed.overview : '',
      winConditions: typeof parsed.winConditions === 'string' ? parsed.winConditions : '',
      keyCards: typeof parsed.keyCards === 'string' ? parsed.keyCards : '',
      gameplan: typeof parsed.gameplan === 'string' ? parsed.gameplan : '',
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Deck primer, written in the builder rather than over it.
 *
 * This was a `max-w-3xl max-h-[90vh]` dialog holding four long-form textareas —
 * so writing about a deck meant covering the deck. The button expands the form
 * in place, inside the panel it already lives in.
 *
 * ## Why the draft is held
 *
 * The four fields are long-form writing and were component state and nothing
 * else, so leaving the tab threw them away. That was survivable on a builder
 * with seven tabs and is not on a deck page with nine: the primer sits on the
 * Record tab, and looking up a card, checking the curve or running the
 * optimiser all unmount it. The draft is kept per deck so that a look at
 * another tab is a look, not a loss.
 *
 * It is `localStorage` and not the database on purpose. A primer is a file you
 * download when it is finished; nothing in the product reads a saved one, so
 * writing it to a table would invent a feature during a merge. This is the
 * smallest thing that stops the typing disappearing, and it is the same
 * `dm.`-prefixed bucket every other remembered preference uses.
 */
export function DeckPrimerGenerator({ deckName, commander, strategy, cardCount, deckId }: DeckPrimerGeneratorProps) {
  const [open, setOpen] = useState(false);
  const initial = () => readDraft(deckId);
  const [overview, setOverview] = useState(() => initial().overview);
  const [winConditions, setWinConditions] = useState(() => initial().winConditions);
  const [keyCards, setKeyCards] = useState(() => initial().keyCards);
  const [gameplan, setGameplan] = useState(() => initial().gameplan);

  /* Written on change rather than on unmount: a tab switch, a reload and a
     closed browser all have to keep the words, and only one of the three runs
     a cleanup. */
  useEffect(() => {
    if (!deckId) return;
    const draft: PrimerDraft = { overview, winConditions, keyCards, gameplan };
    try {
      if (Object.values(draft).every(value => value === '')) {
        localStorage.removeItem(draftKey(deckId));
      } else {
        localStorage.setItem(draftKey(deckId), JSON.stringify(draft));
      }
    } catch {
      /* A full or blocked store is not a reason to stop someone typing. */
    }
  }, [deckId, overview, winConditions, keyCards, gameplan]);

  const generatePrimer = () => {
    let primer = `# ${deckName} - Deck Primer\n\n`;

    if (commander) {
      primer += `**Commander:** ${commander}\n\n`;
    }

    if (strategy) {
      primer += `**Strategy:** ${strategy}\n\n`;
    }

    primer += `**Deck Size:** ${cardCount} cards\n\n`;
    primer += `---\n\n`;

    if (overview) {
      primer += `## Overview\n\n${overview}\n\n`;
    }

    if (winConditions) {
      primer += `## Win Conditions\n\n${winConditions}\n\n`;
    }

    if (keyCards) {
      primer += `## Key Cards\n\n${keyCards}\n\n`;
    }

    if (gameplan) {
      primer += `## Gameplan\n\n${gameplan}\n\n`;
    }

    const blob = new Blob([primer], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deckName.replace(/[^a-z0-9]/gi, "_")}_primer.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Deck primer downloaded");
  };

  const started = [overview, winConditions, keyCards, gameplan].some(value => value.trim());

  return (
    <div className="space-y-3">
      {/* The name sits outside the collapse. It used to be inside, so a
          collapsed primer was a lone button with nothing saying what it wrote,
          and a caller wrapping this in a panel had to invent a heading and end
          up with two. */}
      <div>
        <h3 className="text-lg font-bold">Primer</h3>
        <p className="text-sm text-muted-foreground">
          A written guide to “{deckName}”. Every section you fill in becomes part of the
          downloaded markdown file.
          {started && !open ? ' Your draft is kept.' : ''}
        </p>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="deck-primer-form"
      >
        <BookOpen className="mr-2 h-4 w-4" />
        {open ? "Hide primer" : started ? "Carry on writing" : "Write a primer"}
        {open ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4" />
        )}
      </Button>

      {open && (
        <div id="deck-primer-form" className="space-y-4 rounded-xl bg-muted/40 p-4">

          <div className="space-y-2">
            <Label htmlFor="overview">Deck overview</Label>
            <Textarea
              id="overview"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Describe the overall strategy and theme of your deck..."
              className={cn(FIELD, 'min-h-[100px]')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wincons">Win conditions</Label>
            <Textarea
              id="wincons"
              value={winConditions}
              onChange={(e) => setWinConditions(e.target.value)}
              placeholder="How does this deck win? List primary and backup win conditions..."
              className={cn(FIELD, 'min-h-[100px]')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keycards">Key cards</Label>
            <Textarea
              id="keycards"
              value={keyCards}
              onChange={(e) => setKeyCards(e.target.value)}
              placeholder="List and explain the most important cards in the deck..."
              className={cn(FIELD, 'min-h-[100px]')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gameplan">Gameplan</Label>
            <Textarea
              id="gameplan"
              value={gameplan}
              onChange={(e) => setGameplan(e.target.value)}
              placeholder="Describe the turn-by-turn strategy and decision-making..."
              className={cn(FIELD, 'min-h-[100px]')}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={generatePrimer}>
              <Download className="mr-2 h-4 w-4" />
              Download primer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeckPrimerGenerator;
