import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { CardImage } from '@/components/cards';
import { BORDERLESS_SLIDER } from '@/components/cards/CardSizeSlider';
import { OracleText } from '@/components/cards/OracleText';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { bandForScore, bandLabel, powerTextClass } from '@/lib/deck/power';
import { ArrowLeft, Loader2, Wand2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Set the constraints, with the commander on screen the whole time.
 *
 * The old step 2 stacked four full-width cards down a narrow column and
 * represented the commander — the thing every one of these choices is *about* —
 * as a 64px cropped square of art. Here the card stays at full size in its own
 * column and the controls sit beside it, so the decision and its subject are
 * visible together.
 */

export interface BuildConfig {
  archetype: string;
  targetPower: number;
  maxBudget: number;
  customPrompt: string;
  includeLands: boolean;
  prioritizeSynergy: boolean;
  includeBasics: boolean;
}

export interface ArchetypeOption {
  value: string;
  label: string;
  description?: string;
  synergy?: string;
  powerLevel?: number;
}

export interface ConfigureStageProps {
  commander: any;
  archetypes: ArchetypeOption[];
  config: BuildConfig;
  onConfigChange: (next: BuildConfig) => void;
  onBack: () => void;
  onBuild: () => void;
  building?: boolean;
  error?: string | null;
}

function budgetLabel(budget: number) {
  if (budget <= 150) return 'Budget';
  if (budget <= 500) return 'Mid-range';
  if (budget <= 1500) return 'High-end';
  return 'Premium';
}

/** A block of controls. Surface tint and space — never a rule or a hairline. */
function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5', className)}>
      <div className="mb-4">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function ConfigureStage({
  commander,
  archetypes,
  config,
  onConfigChange,
  onBack,
  onBuild,
  building = false,
  error = null,
}: ConfigureStageProps) {
  const patch = (next: Partial<BuildConfig>) => onConfigChange({ ...config, ...next });

  const band = bandForScore(config.targetPower);
  const chosen = archetypes.find(a => a.value === config.archetype);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* The commander, at size, for the whole of this step. */}
        <aside className="space-y-3 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Commander
            </span>
            <Button variant="ghost" size="sm" onClick={onBack} className="-mt-1 h-7">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Change
            </Button>
          </div>

          <div className="flex justify-center">
            <CardImage card={commander} size="xl" eager className="max-w-full" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold leading-tight">{commander?.name}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Colour *identity*, not the mana cost — identity is what
                  constrains every other card in the deck, and the cost is
                  already printed on the card above. Rendering both put
                  "WUBG GWUB" on one line. */}
              <ColorIdentity colors={commander?.color_identity} size="sm" />
              <span className="text-xs text-muted-foreground">{commander?.type_line}</span>
            </div>
          </div>

          {commander?.oracle_text && (
            <div className="rounded-lg bg-muted/40 p-3">
              <OracleText text={commander.oracle_text} size="xs" className="text-xs leading-relaxed" />
            </div>
          )}
        </aside>

        <div className="space-y-4">
          <Panel
            title="Strategy"
            hint={
              archetypes.length > 0
                ? `Read from ${commander?.name ?? 'the commander'}'s own rules text.`
                : undefined
            }
          >
            {archetypes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No archetypes were returned. Go back and pick the commander again.
              </p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {archetypes.map(archetype => {
                  const active = config.archetype === archetype.value;
                  return (
                    <button
                      key={archetype.value}
                      type="button"
                      onClick={() =>
                        patch({
                          archetype: archetype.value,
                          targetPower: archetype.powerLevel || config.targetPower,
                        })
                      }
                      aria-pressed={active}
                      className={cn(
                        'rounded-lg p-3.5 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-accent shadow-md shadow-black/25'
                          : 'bg-muted/40 hover:bg-muted/70'
                      )}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="font-semibold leading-tight">{archetype.label}</span>
                        {typeof archetype.powerLevel === 'number' && (
                          <span
                            className={cn(
                              'shrink-0 text-xs font-semibold tabular-nums',
                              powerTextClass(bandForScore(archetype.powerLevel))
                            )}
                          >
                            {archetype.powerLevel}/10
                          </span>
                        )}
                      </div>
                      {archetype.description && (
                        <p className="text-sm text-muted-foreground">{archetype.description}</p>
                      )}
                      {archetype.synergy && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground/80">
                          <Zap className="mt-0.5 h-3 w-3 shrink-0" />
                          {archetype.synergy}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Target power">
              <div className="mb-3 flex items-baseline gap-2">
                <span className={cn('text-3xl font-bold tabular-nums', powerTextClass(band))}>
                  {config.targetPower}
                </span>
                <span className="text-sm text-muted-foreground">/ 10</span>
                <span className={cn('ml-auto text-sm font-medium', powerTextClass(band))}>
                  {bandLabel(band)}
                </span>
              </div>
              <Slider
                value={[config.targetPower]}
                onValueChange={v => patch({ targetPower: v[0] })}
                min={1}
                max={10}
                step={1}
                className={BORDERLESS_SLIDER}
              />
              <div className="mt-2 flex justify-between text-[0.7rem] text-muted-foreground">
                <span>Casual</span>
                <span>Focused</span>
                <span>Optimised</span>
                <span>cEDH</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                What the build aims for. The finished list is scored independently
                once it exists.
              </p>
            </Panel>

            <Panel title="Budget">
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  ${config.maxBudget.toLocaleString()}
                </span>
                <span className="ml-auto text-sm font-medium text-muted-foreground">
                  {budgetLabel(config.maxBudget)}
                </span>
              </div>
              <Slider
                value={[config.maxBudget]}
                onValueChange={v => patch({ maxBudget: v[0] })}
                min={50}
                max={5000}
                step={50}
                className={BORDERLESS_SLIDER}
              />
              <div className="mt-2 flex justify-between text-[0.7rem] text-muted-foreground">
                <span>$50</span>
                <span>$500</span>
                <span>$1,500</span>
                <span>$5,000</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Checked against live Scryfall prices for the cards that get picked.
              </p>
            </Panel>
          </div>

          <Panel title="Constraints">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['prioritizeSynergy', 'Prioritise synergy', 'Weight cards that talk to the commander'],
                  ['includeLands', 'Include manabase', 'Build the lands as well as the spells'],
                  ['includeBasics', 'Include basic lands', 'Fill the last slots with basics'],
                ] as const
              ).map(([key, label, hint]) => (
                <label
                  key={key}
                  htmlFor={key}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/40 p-3 transition-colors hover:bg-muted/70"
                >
                  <Checkbox
                    id={key}
                    checked={config[key]}
                    onCheckedChange={checked => patch({ [key]: !!checked } as Partial<BuildConfig>)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="ai-builder-prompt" className="text-sm font-medium">
                Anything else? <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="ai-builder-prompt"
                placeholder="e.g. more counterspells, nothing over 4 mana, keep Cyclonic Rift out"
                value={config.customPrompt}
                onChange={e => patch({ customPrompt: e.target.value })}
                rows={2}
                className="resize-none border-0 bg-muted/50 shadow-none focus-visible:ring-1"
              />
            </div>
          </Panel>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-muted/50 p-4 text-sm text-destructive">{error}</p>
      )}

      {/* Build bar — stays reachable however far the column scrolls. */}
      <div className="sticky bottom-0 z-10 -mx-3 mt-2 bg-background/80 px-3 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-card p-4 shadow-lg shadow-black/25">
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              ['Commander', commander?.name ?? '—'],
              ['Strategy', chosen?.label ?? 'Pick one'],
              ['Target', `${config.targetPower}/10`],
              ['Budget', `$${config.maxBudget.toLocaleString()}`],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {term}
                </dt>
                <dd className="max-w-[14rem] truncate text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <Button
            size="lg"
            onClick={onBuild}
            disabled={!config.archetype || building}
            className="ml-auto px-8"
          >
            {building ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Building…
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-5 w-5" />
                Generate deck
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfigureStage;
