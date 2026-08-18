import { useState } from "react";
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
}

/**
 * Deck primer, written in the builder rather than over it.
 *
 * This was a `max-w-3xl max-h-[90vh]` dialog holding four long-form textareas —
 * so writing about a deck meant covering the deck. The button now expands the
 * form in place, inside the panel it already lives in. The public API is
 * unchanged, so no call site needed editing.
 */
export function DeckPrimerGenerator({ deckName, commander, strategy, cardCount }: DeckPrimerGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState("");
  const [winConditions, setWinConditions] = useState("");
  const [keyCards, setKeyCards] = useState("");
  const [gameplan, setGameplan] = useState("");

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

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="deck-primer-form"
      >
        <BookOpen className="mr-2 h-4 w-4" />
        {open ? "Hide primer" : "Write a primer"}
        {open ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4" />
        )}
      </Button>

      {open && (
        <div id="deck-primer-form" className="space-y-4 rounded-xl bg-card p-4 shadow-sm">
          <div>
            <h3 className="font-medium">Deck primer</h3>
            <p className="text-sm text-muted-foreground">
              A written guide to “{deckName}”. Every section you fill in becomes part of the
              downloaded markdown file.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="overview">Deck overview</Label>
            <Textarea
              id="overview"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Describe the overall strategy and theme of your deck..."
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wincons">Win conditions</Label>
            <Textarea
              id="wincons"
              value={winConditions}
              onChange={(e) => setWinConditions(e.target.value)}
              placeholder="How does this deck win? List primary and backup win conditions..."
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keycards">Key cards</Label>
            <Textarea
              id="keycards"
              value={keyCards}
              onChange={(e) => setKeyCards(e.target.value)}
              placeholder="List and explain the most important cards in the deck..."
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gameplan">Gameplan</Label>
            <Textarea
              id="gameplan"
              value={gameplan}
              onChange={(e) => setGameplan(e.target.value)}
              placeholder="Describe the turn-by-turn strategy and decision-making..."
              className="min-h-[100px]"
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
