import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { AITemplateRecommendations } from '@/components/templates/AITemplateRecommendations';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  FacetChip,
  FilterBar,
  ListingFrame,
  ListingSearch,
  SortControl,
  matchedLabel,
  resultSentence,
  totalActiveFilters,
  useListingView,
  useSearchText,
  type ListingMode,
  type SortOption,
} from '@/components/listing';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { LayoutGrid, Loader2, Plus, ScrollText } from 'lucide-react';
import { BASE_TEMPLATES } from '@/lib/deckbuilder/templates/base-templates';
import type { ArchetypeTemplate } from '@/lib/deckbuilder/types';
import { formatLabel } from '@/lib/deck/formats';

/**
 * Archetype templates.
 *
 * This page used to be a hardcoded array of six invented archetypes carrying
 * fabricated statistics — win rates, popularity percentages and a frozen
 * "2 days ago" — with every control (search, format chips, filter button, sort
 * dropdown, Preview, View) wired to nothing. It now renders the real archetype
 * templates that drive the deck builder, and every control works.
 *
 * There is deliberately no win rate or popularity figure: the platform does
 * not collect that data, so it cannot be shown.
 *
 * ## What the consistency pass changed
 *
 * This was the worst-drifted listing in the product and none of it was decided.
 * A bare `<Input className="pl-10">`, which is the shadcn default and therefore
 * draws the hairline border the owner has ruled out. A bare `<SelectTrigger>`,
 * same. A row of `variant="outline"` format buttons, which is literally a
 * border variant. No clear control at all, so a reader who narrowed to a format
 * with no matches had a blank panel and no way back except finding the right
 * button again. No debounce. No URL for the search. And the details panel was a
 * centred `Dialog` that dims the page and traps focus, which design law 3 rules
 * out outright.
 *
 * Everything works the same and every control is still here. The search, the
 * sort and the format chips are `FilterBar`'s; the count line is the shared
 * sentence; the details panel is a right-hand slide-over, which is the approved
 * pattern for looking at something without leaving the page you are on.
 */

type SortKey = 'name' | 'format' | 'colors';

const TEMPLATES: ArchetypeTemplate[] = Object.values(BASE_TEMPLATES);

const ALL_FORMATS = Array.from(
  new Set(TEMPLATES.flatMap(template => template.formats))
).sort();

const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: 'Name' },
  { value: 'format', label: 'Format' },
  { value: 'colors', label: 'Colour count' },
];

/**
 * One mode: a wall of archetype cards.
 *
 * `ViewModeToggle` draws nothing for a single mode, so this costs no chrome. It
 * is declared rather than omitted because `ListingFrame` needs to know who lays
 * the body out, and here the page does: an archetype card is a block of text
 * with a quota summary, not a card image, so it belongs in its own responsive
 * grid rather than in a `CardGrid` at a slider's width. There is no size
 * control for the same reason.
 */
const TEMPLATE_MODES: ListingMode[] = [
  { id: 'grid', label: 'Archetypes', icon: LayoutGrid, layout: 'rows' },
];

/** Human-readable role names for the quota table. */
function roleLabel(tag: string): string {
  return tag
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function templateKeywords(template: ArchetypeTemplate): string[] {
  return Array.from(
    new Set([
      ...Object.keys(template.weights.synergy),
      ...Object.keys(template.weights.roles),
    ])
  );
}

export default function Templates() {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* The search is in the URL and debounced now. It was neither, so an
     archetype search was not something you could send anybody and the page
     re-filtered on every keystroke. */
  const [searchQuery, commitSearchQuery] = useSearchText('q');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const view = useListingView({
    surface: 'deckmatrix.templates.view',
    modes: TEMPLATE_MODES,
    defaultSortKey: 'name',
    defaultSortDir: 'asc',
  });
  const sortKey = view.sortKey as SortKey;
  const [userDecks, setUserDecks] = useState<Array<{ name: string; format: string; colors: string[] }>>([]);
  const [previewTemplate, setPreviewTemplate] = useState<ArchetypeTemplate | null>(null);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);

  const activeFilters = totalActiveFilters(
    searchQuery.trim() ? 1 : 0,
    selectedFormat !== 'all' ? 1 : 0
  );

  /* The clear control this page did not have. A reader who narrowed to a format
     with nothing in it had a blank panel and no way out of it. */
  const clearEverything = useCallback(() => {
    commitSearchQuery(undefined);
    setSelectedFormat('all');
  }, [commitSearchQuery]);

  useEffect(() => {
    if (!user) return;

    const loadUserDecks = async () => {
      const { data, error } = await supabase
        .from('user_decks')
        .select('name, format, colors')
        .eq('user_id', user.id)
        .limit(10);

      if (!error && data) {
        setUserDecks(
          data.map(deck => ({
            name: deck.name,
            format: deck.format,
            colors: deck.colors ?? [],
          }))
        );
      }
    };

    loadUserDecks();
  }, [user]);

  const visibleTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = TEMPLATES.filter(template => {
      if (selectedFormat !== 'all' && !template.formats.includes(selectedFormat)) {
        return false;
      }
      if (!query) return true;

      const haystack = [
        template.name,
        template.id,
        ...template.formats,
        ...templateKeywords(template),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });

    /* The three axes gain a direction, which is three orderings this page did
       not have a control for. Colour count reads high-to-low descending, which
       is what the single "Colour count" option used to mean. */
    const flip = view.sortDir === 'desc' ? -1 : 1;
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'format':
          return (
            flip * a.formats[0].localeCompare(b.formats[0]) || a.name.localeCompare(b.name)
          );
        case 'colors':
          return (
            flip * ((a.colors?.length ?? 0) - (b.colors?.length ?? 0)) ||
            a.name.localeCompare(b.name)
          );
        case 'name':
        default:
          return flip * a.name.localeCompare(b.name);
      }
    });
  }, [searchQuery, selectedFormat, sortKey, view.sortDir]);

  /** Create a real deck seeded from this archetype and open it in the builder. */
  const handleUseTemplate = async (template: ArchetypeTemplate) => {
    if (!user) {
      showError('Sign in required', 'Log in to create a deck from a template');
      return;
    }

    const format =
      selectedFormat !== 'all' && template.formats.includes(selectedFormat)
        ? selectedFormat
        : template.formats[0];

    setCreatingFrom(template.id);
    try {
      const { data: newDeck, error } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: template.name,
          format,
          // See Precons: the power column mirrors the canonical score and is
          // never seeded with a constant.
          colors: template.colors ?? [],
          description: `Built from the ${template.name} archetype template.`,
        })
        .select()
        .single();

      if (error) throw error;

      showSuccess('Deck created', `"${template.name}" is ready to build`);
      navigate(`/deck/${newDeck.id}`);
    } catch (error) {
      console.error('Failed to create deck from template:', error);
      showError('Error', 'Could not create a deck from this template');
    } finally {
      setCreatingFrom(null);
    }
  };

  return (
    <StandardPageLayout
      title="Deck Templates"
      /* "Archetype blueprints that define the role quotas and curve a deck
         should hit". "Role quotas" is a term this product invented for itself,
         which copy rule 1 rules out: write for a Commander player who does not
         know this product. */
      description="Ready-made shapes for a deck: how many creatures, how much removal, and where the curve should sit"
    >
      <div className="space-y-4">
        <AITemplateRecommendations
          selectedFormat={selectedFormat !== 'all' ? selectedFormat : undefined}
          userDecks={userDecks}
        />

        <FilterBar
          view={view}
          activeCount={activeFilters}
          onClear={clearEverything}
          search={
            <ListingSearch
              value={searchQuery}
              onCommit={commitSearchQuery}
              placeholder="Search archetypes by name, role or synergy"
              label="Search templates"
            />
          }
          sort={
            <SortControl
              options={SORT_OPTIONS}
              value={sortKey}
              onValueChange={view.setSortKey}
              dir={view.sortDir}
              onToggleDir={view.toggleSortDir}
              label="Sort templates by"
            />
          }
          facets={
            /* `FacetChip`, not `variant="outline"`. Outline is a border variant,
               and these were eleven hairlines in a row on a page whose whole
               palette is meant to be borderless. */
            <>
              <FacetChip selected={selectedFormat === 'all'} onClick={() => setSelectedFormat('all')}>
                All formats
              </FacetChip>
              {ALL_FORMATS.map(format => (
                <FacetChip
                  key={format}
                  selected={selectedFormat === format}
                  onClick={() => setSelectedFormat(format)}
                >
                  {formatLabel(format)}
                </FacetChip>
              ))}
            </>
          }
        />

        <ListingFrame
          view={view}
          count={visibleTemplates.length}
          summary={resultSentence([
            matchedLabel(visibleTemplates.length, TEMPLATES.length, 'archetype'),
          ])}
          empty={{
            title: 'No archetypes match',
            description: 'Try a different search term, or a different format.',
            icon: ScrollText,
            onClearFilters: activeFilters > 0 ? clearEverything : undefined,
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleTemplates.map(template => {
              const keywords = templateKeywords(template).slice(0, 5);
              const totalMinimum = Object.values(template.quotas.counts).reduce(
                (sum, quota) => sum + quota.min,
                0
              );

              return (
                <Card key={template.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <ColorIdentity colors={template.colors ?? []} size="sm" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {template.formats.map(format => (
                        <Badge key={format} variant="secondary" className="text-[10px]">
                          {formatLabel(format)}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-3">
                    <ul className="flex flex-wrap gap-1">
                      {keywords.map(keyword => (
                        <li
                          key={keyword}
                          /* `Badge variant="outline"` is a hairline. Surface
                             tint carries the same distinction. */
                          className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-normal text-muted-foreground"
                        >
                          {roleLabel(keyword)}
                        </li>
                      ))}
                    </ul>

                    <p className="text-xs text-muted-foreground">
                      {Object.keys(template.quotas.counts).length} role quotas · at least{' '}
                      {totalMinimum} slots defined
                    </p>

                    <div className="mt-auto flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={() => handleUseTemplate(template)}
                        disabled={creatingFrom === template.id}
                      >
                        {creatingFrom === template.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Use template
                      </Button>
                      <Button variant="secondary" onClick={() => setPreviewTemplate(template)}>
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ListingFrame>
      </div>

      {/*
        The details panel, as a right-hand slide-over.

        It was a centred `Dialog`, which dims the page, traps focus and covers
        the wall of archetypes you were comparing against. Design law 3 rules
        that out and names the replacement: an action taken without leaving the
        current context is a slide-over, and the page stays visible and keeps
        its scroll position behind it. Every section is unchanged — the role
        quotas, the creature curve targets, the required packages and the
        "Use this template" action at the foot.
      */}
      <Sheet
        open={Boolean(previewTemplate)}
        onOpenChange={open => {
          if (!open) setPreviewTemplate(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-lg"
        >
          {previewTemplate && (
            <>
              {/* pr-12 clears the Sheet's own close control. */}
              <div className="py-3 pl-4 pr-12">
                <SheetTitle className="text-lg font-semibold">{previewTemplate.name}</SheetTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Blueprint the deck builder uses to fill this archetype.
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <ColorIdentity colors={previewTemplate.colors ?? []} size="md" />
                  {previewTemplate.formats.map(format => (
                    <Badge key={format} variant="secondary">
                      {formatLabel(format)}
                    </Badge>
                  ))}
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Role quotas</h3>
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {Object.entries(previewTemplate.quotas.counts).map(([tag, quota]) => (
                      <li key={tag} className="flex justify-between rounded px-2 py-1 odd:bg-muted/30">
                        <span className="text-muted-foreground">{roleLabel(tag)}</span>
                        <span className="tabular-nums">
                          {quota.min}–{quota.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Creature curve targets</h3>
                  <ul className="grid grid-cols-4 gap-2 text-sm">
                    {Object.entries(previewTemplate.quotas.creatures_curve).map(([mv, range]) => (
                      <li key={mv} className="rounded bg-muted/40 p-2 text-center">
                        <span className="block text-xs text-muted-foreground">MV {mv}</span>
                        <span className="font-medium tabular-nums">{range}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {previewTemplate.packages.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Required packages</h3>
                    <ul className="space-y-2 text-sm">
                      {previewTemplate.packages.map(pkg => (
                        <li key={pkg.name} className="rounded bg-muted/40 p-3">
                          <p className="font-medium">{roleLabel(pkg.name)}</p>
                          <p className="text-muted-foreground">
                            {pkg.require
                              .map(req => `${req.count}× ${roleLabel(req.tag)}`)
                              .join(', ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <Button
                  className="w-full"
                  onClick={() => {
                    const template = previewTemplate;
                    setPreviewTemplate(null);
                    handleUseTemplate(template);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Use this template
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </StandardPageLayout>
  );
}
