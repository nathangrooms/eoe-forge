import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { AITemplateRecommendations } from '@/components/templates/AITemplateRecommendations';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Loader2, Plus, Search } from 'lucide-react';
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
 */

type SortKey = 'name' | 'format' | 'colors';

const TEMPLATES: ArchetypeTemplate[] = Object.values(BASE_TEMPLATES);

const ALL_FORMATS = Array.from(
  new Set(TEMPLATES.flatMap(template => template.formats))
).sort();

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'format', label: 'Format' },
  { value: 'colors', label: 'Colour count' },
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [userDecks, setUserDecks] = useState<Array<{ name: string; format: string; colors: string[] }>>([]);
  const [previewTemplate, setPreviewTemplate] = useState<ArchetypeTemplate | null>(null);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);

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

    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'format':
          return a.formats[0].localeCompare(b.formats[0]) || a.name.localeCompare(b.name);
        case 'colors':
          return (
            (b.colors?.length ?? 0) - (a.colors?.length ?? 0) || a.name.localeCompare(b.name)
          );
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [searchQuery, selectedFormat, sortKey]);

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
      navigate(`/deck-builder?deck=${newDeck.id}`);
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
      description="Archetype blueprints that define the role quotas and curve a deck should hit"
    >
      <div className="space-y-6">
        <AITemplateRecommendations
          selectedFormat={selectedFormat !== 'all' ? selectedFormat : undefined}
          userDecks={userDecks}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search archetypes by name, role or synergy…"
              className="pl-10"
              aria-label="Search templates"
            />
          </div>

          <Select value={sortKey} onValueChange={value => setSortKey(value as SortKey)}>
            <SelectTrigger className="w-full md:w-48" aria-label="Sort templates">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  Sort: {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedFormat === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFormat('all')}
            aria-pressed={selectedFormat === 'all'}
          >
            All formats
          </Button>
          {ALL_FORMATS.map(format => (
            <Button
              key={format}
              variant={selectedFormat === format ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFormat(format)}
              aria-pressed={selectedFormat === format}
            >
              {formatLabel(format)}
            </Button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {visibleTemplates.length} archetype{visibleTemplates.length === 1 ? '' : 's'}
        </p>

        {visibleTemplates.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="font-medium">No archetypes match</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search term or format.
              </p>
            </CardContent>
          </Card>
        ) : (
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
                        <li key={keyword}>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {roleLabel(keyword)}
                          </Badge>
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
                      <Button variant="outline" onClick={() => setPreviewTemplate(template)}>
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(previewTemplate)}
        onOpenChange={open => {
          if (!open) setPreviewTemplate(null);
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-auto">
          {previewTemplate && (
            <>
              <DialogHeader>
                <DialogTitle>{previewTemplate.name}</DialogTitle>
                <DialogDescription>
                  Blueprint used by the deck builder to fill this archetype.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
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
                      <li key={tag} className="flex justify-between border-b border-border py-1">
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
                      <li key={mv} className="rounded border border-border p-2 text-center">
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
                        <li key={pkg.name} className="rounded border border-border p-3">
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
        </DialogContent>
      </Dialog>
    </StandardPageLayout>
  );
}
