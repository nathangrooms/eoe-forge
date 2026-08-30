import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BASE_TEMPLATES } from '@/lib/deckbuilder/templates/base-templates';
import { suggestTemplates, type FitDeck } from '@/lib/deck/templateFit';

/**
 * Which blueprint fits the decks you already have.
 *
 * WHAT THIS REPLACED, AND WHY
 * ---------------------------
 * `AITemplateRecommendations`, which sent Tutor a prompt asking for "5-7
 * specific deck template recommendations", "why each fits their playstyle",
 * "power level range for each archetype" and "learning curve and complexity".
 * Three of those four are things this product holds no data for, and Tutor is
 * deliberately built to refuse rather than invent: pressed on 2026-08-30 it
 * answered "I cannot answer that one, and I would rather say so than guess."
 *
 * Worse, the panel never showed even that. It read `data.text` from a response
 * that has only ever had `data.message`, so every press printed "Failed to
 * generate recommendations. Please try again." after a successful HTTP 200. The
 * feature had never worked in either direction.
 *
 * The panel's own promise is smaller than the prompt was and is answerable
 * without asking anybody: "Reads the decks you already have and suggests
 * blueprints that fit them." A template declares its formats and colours, a
 * deck declares its format and identity, and whether one fits inside the other
 * is a comparison. `templateFit.ts` does it, and it is tested.
 *
 * NO NETWORK, NO LOADING STATE, NO FAILURE STATE. There is nothing to wait for
 * and nothing to fail, so the answer is simply on the screen. A button that
 * asks a question already answered is a button worth deleting.
 */

export interface TemplateFitPanelProps {
  userDecks?: FitDeck[];
  /** The format tab in force, when one is. Narrows to what is being looked at. */
  selectedFormat?: string;
}

export function TemplateFitPanel({ userDecks = [], selectedFormat }: TemplateFitPanelProps) {
  const decks = useMemo(
    () =>
      userDecks.filter(
        d => !selectedFormat || String(d.format).toLowerCase() === selectedFormat.toLowerCase()
      ),
    [userDecks, selectedFormat]
  );

  const fits = useMemo(
    () => suggestTemplates(decks, Object.values(BASE_TEMPLATES)),
    [decks]
  );

  /* The one deck every suggestion matched, or null when they differ. */
  const onlyDeck = useMemo(() => {
    const names = new Set(fits.map(f => f.deckName));
    return names.size === 1 ? [...names][0] : null;
  }, [fits]);

  /* The reason, when every suggestion gives the SAME one. Three tiles all
     reading "Exactly your WUBG colours, and commander" is one fact printed
     three times, and a list whose rows are identical past the name carries no
     information past the first row. */
  const sharedDetail = useMemo(() => {
    if (!onlyDeck || fits.length < 2) return null;
    const details = new Set(fits.map(f => f.detail));
    return details.size === 1 ? [...details][0] : null;
  }, [fits, onlyDeck]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Which blueprint fits your decks</h3>
          <p className="text-sm text-muted-foreground">
            Matched on format and colour identity against the decks on your account.
          </p>
        </div>

        {/* Three honest empty states, because they are three different facts and
            one message for all of them would be wrong twice. */}
        {userDecks.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Build a deck and this will match blueprints to it. There is nothing to
            compare against yet.
          </p>
        ) : decks.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            None of your decks are {selectedFormat}. Switch the format above, or pick a
            blueprint from the list below.
          </p>
        ) : fits.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            No blueprint below is buildable in your decks' colours. Every one of them
            needs a colour your decks cannot play.
          </p>
        ) : (
          <>
            {/* THE DECK IS NAMED ONCE when every match is against the same one.
                Otherwise each entry repeated a sixty-character deck title and
                three suggestions said the same sentence three times, which is
                a list carrying no information past the first row. */}
            {onlyDeck && (
              <p className="mb-2 text-xs text-muted-foreground">
                Matched against <span className="text-foreground">{onlyDeck}</span>
                {sharedDetail ? ` · ${sharedDetail.replace(/\.$/, '')}` : ''}
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {fits.map(fit => (
                <li key={fit.templateId} className="rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-medium text-foreground">{fit.templateName}</p>
                  {/* Only when it says something the line above did not. Three
                      tiles repeating "Exactly your WUBG colours, and commander"
                      is one fact printed three times. */}
                  {!sharedDetail && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {onlyDeck ? fit.detail : fit.because}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
