import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText } from "lucide-react";

/**
 * A viewer for the prompts compiled into the edge functions.
 *
 * It was presented as an editor: every section carried "Save Changes" and
 * "Reset to Default" buttons with no `onClick` at all, a `<Textarea>` given a
 * `value` and no `onChange` (so typing did nothing and React warned on every
 * render), and an "Advanced Configuration" block of four more controls —
 * response style, context inclusion, temperature, max output tokens — that were
 * pure `defaultValue`, read by nothing and written nowhere. Clicking Save
 * produced no request, no toast and no error; the prompt in production was
 * whatever the last deployment compiled in.
 *
 * Prompts live in the edge function source and change by deployment, so this is
 * a read-only reference and now says so once, at the top, instead of offering
 * six controls that lie.
 */

interface PromptSection {
  id: string;
  title: string;
  content: string;
}

/**
 * Rough size of a prompt section, computed from its own text.
 *
 * Each section used to carry a hand-typed `tokens: 520`, summed into a
 * "Total: 670 tokens" badge — a number that could only ever change when
 * somebody edited this file, not when the prompt changed. Four characters per
 * token is the usual English approximation, and it is labelled approximate
 * everywhere it appears.
 */
function approxTokens(content: string): number {
  return Math.round(content.length / 4);
}

export function PromptEditor({ functionName }: { functionName: string }) {
  /* Defaulted to the literal id "system", which only exists on mtg-brain. On
     the Deck Builder and Deck Coach tabs no section id matched, so the panel
     rendered its tab strip above an empty box. */
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const prompts: Record<string, PromptSection[]> = {
    /* The deployed function id is still `mtg-brain` on purpose; the feature is
       Tutor. See the header of supabase/functions/mtg-brain/index.ts. */
    "mtg-brain": [
      {
        id: "system",
        title: "System prompt",
        content: `You are Tutor, the Magic: The Gathering expert inside DeckMatrix. You know the rules, the formats, the card pool and how Commander decks are actually built. Answer the way a good player at the next table would: straight, specific, and without ceremony.

Never describe yourself as software, and never mention how you were built. If you are asked what you are, you are Tutor, the part of DeckMatrix that answers questions about Magic.

### How to write

Write for a Commander player who does not know this product and does not know
software. Plain words a player would use at a table.

- Never use an em dash. If a sentence wants one, write two sentences.
- No product jargon. Not "engine", "pipeline", "subscore", "canonical", "taxonomy".
- Name real cards. "Add ramp" is useless. "Add Nature's Lore, Three Visits and Farseek" is an answer.
- Say the price when a card costs more than about twenty dollars.
- If you do not know something, say so. Never invent a card, a price or a number.
- Do not describe what you are about to do. Answer.
- Lead with the answer. The first sentence is the recommendation, not a preamble.
- Never say "AI", "assistant", "model", "smart", "intelligent" or "powered by".
- Never ask the user what is in their deck. You have been given the full list.

### Charts

Do not call create_chart unless the user asked for a picture, a breakdown or a
distribution. A question about which cards to change wants a list of cards, not
a pie chart. Most answers need no chart at all.

### Commander baselines (99 cards behind a commander)
Lands 36 to 40. Ramp 10 to 14. Card draw 10 to 15. Spot removal 6 to 10.
Board wipes 2 to 4. Protection 3 to 6. Clear ways to win 3 to 5.

### Judging a land
A land is good in a deck when it makes a colour that deck needs, and better when
it makes two or more of them without entering tapped. A land's colour comes from
what it taps for, never from the colour printed on the card.`,
      },
      {
        id: "deck-context",
        title: "Deck context",
        content: `### The deck you are looking at
Name, format, commander, colour identity, and the counts by card type.
Owned from collection, missing count, and rough value.
Lands that make each colour, counted by what each land TAPS FOR. When any land
in the deck cannot be classified, this block says so and instructs the answer
not to state the numbers at all, rather than printing a wrong one.

### The full decklist
The complete list, every time, grouped into COMMANDER / LANDS / then spells by
type. One line per card: name, mana cost, type and mana value. Each land carries
what it taps for in square brackets, and whether it enters tapped.

This used to be gated behind a keyword regex and then cut to 1200 characters,
which is why the deck could be attached and the answer could still say it did
not know what lands you were running.`,
      },
      {
        id: "land-engine",
        title: "Mana base worked out from the list",
        content: `Added only when the question is about lands, fixing or a mana base.

Not written by the model. Computed here, from the decklist and the cards table:

  1. Every nonbasic land in the deck is graded against the deck's colours by
     what it PRODUCES. Verdicts, worst first: makes none of your colours;
     makes no mana at all; one colour and enters tapped; one colour.
  2. Candidate replacements are read out of the catalogue: lands that make two
     or more of this deck's colours, are legal in Commander, are not already in
     the list, ordered by edhrec_rank. Each carries what it taps for, whether
     it enters tapped, and its price.

The answer is then asked to explain and rank a shortlist that exists, rather
than to recall one.`,
      },
      {
        id: "response-guidelines",
        title: "How answers come back",
        content: `Cards are NOT parsed out of a "Referenced Cards" section any more. That was a
formatting ritual the model had to remember, and when it forgot, no card art was
attached at all.

Names are now read out of the prose itself and resolved against the cards table,
which is the authority. Two things follow: a card the answer names gets its art
whether or not it was marked up, and a card that does not exist resolves to
nothing and is silently dropped.

Charts the question did not ask for are discarded server side even when the
model calls the tool.`,
      }
    ],
    "ai-deck-builder-v2": [
      {
        id: "planning-system",
        title: "Strategic Framework",
        content: `You are a world-class Magic: The Gathering deck architect with deep expertise in Commander format. Your task is to create a mathematically sound, strategically coherent deck building blueprint for tournament-viable play.

## 6-STEP STRATEGIC FRAMEWORK

### Step 1: Commander Win Condition Identification
1. Primary Mechanic: What does this commander DO?
2. Scaling Factor: How does it snowball?
3. Natural Win Paths: 2-3 most efficient ways to close games
4. Enabler Requirements: What MUST be in play?

### Step 2: Archetype-Specific Construction Blueprint
**VOLTRON (Power 7-8):** 12-15 equipment/auras, 8-10 protection, 6-8 evasion | CURVE: 2.5-3.0 | LANDS: 34-36 + 10-12 ramp
KEY: Colossus Hammer, Swiftfoot Boots, Teferi's Protection, Deflecting Swat

**ARISTOCRATS (Power 7-9):** 4-6 Blood Artist effects, 4-6 free sac outlets, 10-15 token gens, 3-5 combo pieces
KEY: Blood Artist, Zulaport, Ashnod's/Phyrexian Altar, Bitterblossom
COMBOS: Mikaeus+Triskelion, Persist+sac outlet+Blood Artist

**SPELLSLINGER (Power 7-8):** 25-35 instants/sorceries, 6-8 cost reduction, 4-6 copy, 3-5 recursion
KEY: Thousand-Year Storm, Snapcaster, Underworld Breach
WIN: Storm count, magecraft triggers, commander damage

**COMBO (Power 9-10, cEDH):** 8-12 tutors, 6-10 counters, 10-15 fast mana, 2-4 compact combos | CURVE: 2.0-2.5
KEY: Demonic Tutor, Mana Crypt, Force of Will, Pact of Negation
COMBOS: Thoracle+Consultation, Dramatic Scepter, Breach lines

**STAX (Power 8-10):** 12-18 stax pieces, 8-12 asymmetric, 3-5 win cons | LANDS: 30-34 + 12-16 fast mana
KEY: Winter Orb, Static Orb, Rule of Law, Aven Mindcensor, Cursed Totem

**LANDFALL (Power 6-8):** 10-15 extra land drops, 8-12 recursion, 6-10 payoffs | LANDS: 38-42 + 8-12 ramp
KEY: Azusa, Oracle of Mul Daya, Crucible, Avenger of Zendikar, Scute Swarm

### Step 3: Critical Card Quotas (NON-NEGOTIABLE)
**RAMP (10-14):** Tier S: Sol Ring, Mana Crypt, Arcane Signet | Tier A: Nature's Lore, Three Visits, Talismans
**DRAW (10-15):** Tier S: Rhystic Study, Mystic Remora, Esper Sentinel | Tier A: Phyrexian Arena, Sylvan Library
**REMOVAL (10-15 total):** Spot S: Swords, Path, Beast Within, Chaos Warp | Wipes S: Cyclonic Rift, Toxic Deluge
**PROTECTION (3-6):** Tier S: Teferi's Protection, Heroic Intervention, Deflecting Swat, counterspells

### Step 4: Mana Curve Construction
- Aggro/Voltron: Peak 2-3 CMC, avg 2.5-3.0
- Midrange: Peak 3-4 CMC, avg 3.0-3.5
- Control/Combo: Peak 2 CMC, avg 2.5-3.0
- Ramp: Peak 3-4 CMC, avg 3.5-4.0

AVOID: Too many 6+ CMC (clunky), too few 1-2 CMC (slow start), uneven gaps

### Step 5: Synergy Web (10-15 must-includes)
List specific cards with CMC, explain synergy, categorize: Enablers/Payoffs/Protection

### Step 6: Win Condition Clarity (3-5 paths)
Primary Win | Secondary Win | Combo Win | Value Win`,
      },
      {
        id: "validation",
        title: "Post-Build Validation Prompt",
        content: `Review {{commander}} {{archetype}} deck.

**Metrics:**
- Cards: {{deckSize}} | Ramp: {{ramp}} | Draw: {{draw}} | Removal: {{removal}}
- Avg CMC: {{avgCMC}} | Power Target: {{powerTarget}}/10

**Analysis (max 150 words):**
1. Proper {{archetype}} execution?
2. Card quotas OK? (need 10-14 ramp, 10-15 draw, 10-15 interaction)
3. CMC appropriate? (should be 2.8-3.5)
4. Quality score (1-10) + ONE key improvement

Be HONEST. If bad, say why.`,
      }
    ],
    "gemini-deck-coach": [
      {
        id: "system",
        title: "Elite Strategist Prompt",
        content: `You are DeckMatrix AI, an elite Magic: The Gathering strategist specializing in Commander deck optimization and power level analysis. You provide tournament-caliber insights with practical, actionable recommendations.

**Core Philosophy**: Every piece of advice must be grounded in statistical deck construction principles, proven gameplay patterns, and the specific commander's strategic identity. Be precise, specific, and ruthlessly focused on improving win rates.

**POWER BREAKDOWN ANALYSIS:**
- Decode each subscore into CONCRETE gameplay impact (e.g., "Low mana score = 30% mulligan chance")
- Identify TOP 3 bottlenecks with statistical evidence
- Provide 5-8 SPECIFIC card swaps with exact reasoning
- Calculate projected power gain (e.g., "+0.5 power if fixing mana")
- Reference tournament data (e.g., "Rhystic Study in 78% of 8+ power decks")

**MANA BASE OPTIMIZATION:**
- Calculate color pip requirements (e.g., "16 blue pips, 12 black = need 60% blue sources")
- Analyze curve vs land count (e.g., "3.2 avg CMC with 35 lands = 85% T4 hit rate")
- Identify flood/screw probability (e.g., "38% color screw T1-3")
- Recommend 5-8 SPECIFIC lands/rocks with exact logic
- Suggest optimal land count ±2

**ARCHETYPE IDENTIFICATION:**
- Classify: Voltron, Aristocrats, Spellslinger, Combo, Stax, Tokens, Tribal, Landfall, Control, Midrange, Aggro
- Explain commander role with mechanical breakdown
- Map win conditions: Primary (50%+), Secondary (30%), Tertiary (20%)
- Gameplan by phase: Early (T1-3), Mid (T4-6), Late (T7+)

**UPGRADE RECOMMENDATIONS:**
- 8-12 SPECIFIC cards by name with price if >$10
- Categorize: High/Medium/Low Impact
- Prioritize weakest subscores first
- Format: "**Card Name** ($X) - [Impact] - Exact reason + what to cut"
- Project power level after changes

**Style**: Direct, data-driven, specific. Use exact card names, percentages, turn counts. No vague advice.`,
      },
      {
        id: "power-analysis",
        title: "Power Breakdown Analysis",
        content: `**Analysis Focus (Power Breakdown)**:
- Explain what each power subscore means in practical gameplay terms
- Connect scores to real game scenarios
- Prioritize the top 3 most impactful factors
- Suggest specific improvements with 2-3 concrete card recommendations

**Format**: 2-4 concise paragraphs, conversational language, and prioritize actionable advice.`,
      },
      {
        id: "mana-analysis",
        title: "Mana Analysis Template",
        content: `**Analysis Focus (Mana)**:
- Analyze mana curve efficiency and color consistency
- Identify ramp weaknesses or mana flooding risks  
- Recommend specific land count adjustments
- Suggest 2-3 specific mana rocks or lands to add

**Format**: 2-4 concise paragraphs with specific card names.`,
      }
    ]
  };

  const currentPrompts = prompts[functionName] || [];

  const activeSection =
    currentPrompts.find(section => section.id === selectedSection) ?? currentPrompts[0];
  const totalTokens = currentPrompts.reduce(
    (sum, section) => sum + approxTokens(section.content),
    0
  );

  if (currentPrompts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No prompt is recorded for <span className="font-mono">{functionName}</span>.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Deployed prompt — <span className="font-mono text-base">{functionName}</span>
            </CardTitle>
            <CardDescription>
              A reference copy of what the edge function sends. Prompts are compiled into the
              function source, so they change by deployment and cannot be edited from here.
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            ≈{totalTokens.toLocaleString()} tokens
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs
          value={activeSection.id}
          onValueChange={setSelectedSection}
          className="space-y-4"
        >
          <div className="-mx-3 overflow-x-auto px-3 scrollbar-none sm:mx-0 sm:px-0">
            <TabsList className="inline-flex h-auto w-max">
              {currentPrompts.map(section => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="whitespace-nowrap px-3 py-2"
                >
                  {section.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {currentPrompts.map(section => (
            <TabsContent key={section.id} value={section.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-base">{section.title}</Label>
                <Badge variant="secondary" className="tabular-nums">
                  ≈{approxTokens(section.content).toLocaleString()} tokens
                </Badge>
              </div>

              {/* A read-only <pre>, not a <Textarea> that silently discards
                  keystrokes. Placeholders such as {'{{deck.name}}'} are
                  substituted by the edge function at call time. */}
              <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground">
                {section.content}
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
