import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { BookOpen, Download } from "lucide-react";
import { toast } from "sonner";

interface DeckPrimerGeneratorProps {
  deckName: string;
  commander?: string;
  strategy?: string;
  cardCount: number;
}

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-2 h-4 w-4" />
          Generate Primer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deck Primer Generator</DialogTitle>
          <DialogDescription>
            Create a comprehensive guide for your deck
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="overview">Deck Overview</Label>
            <Textarea
              id="overview"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Describe the overall strategy and theme of your deck..."
              className="min-h-[100px]"
            />
          </div>

          <div>
            <Label htmlFor="wincons">Win Conditions</Label>
            <Textarea
              id="wincons"
              value={winConditions}
              onChange={(e) => setWinConditions(e.target.value)}
              placeholder="How does this deck win? List primary and backup win conditions..."
              className="min-h-[100px]"
            />
          </div>

          <div>
            <Label htmlFor="keycards">Key Cards</Label>
            <Textarea
              id="keycards"
              value={keyCards}
              onChange={(e) => setKeyCards(e.target.value)}
              placeholder="List and explain the most important cards in the deck..."
              className="min-h-[100px]"
            />
          </div>

          <div>
            <Label htmlFor="gameplan">Gameplan</Label>
            <Textarea
              id="gameplan"
              value={gameplan}
              onChange={(e) => setGameplan(e.target.value)}
              placeholder="Describe the turn-by-turn strategy and decision-making..."
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={generatePrimer}>
            <Download className="mr-2 h-4 w-4" />
            Download Primer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
