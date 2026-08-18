import { ALL_FORMATS } from '@/lib/magic/formats';

/**
 * One format list for the deck surfaces.
 *
 * The filter popover used to offer three formats while the deck tile rendered
 * badges for eight, so a Modern or Pauper deck could never be filtered to —
 * and selecting any available option hid the five unsupported ones entirely.
 * Everything that names a format now reads this list.
 */

/** Formats a constructed deck can actually be saved as, plus a custom escape hatch. */
const DECK_FORMAT_CODES = [
  'commander',
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'brawl',
  'historic',
  'alchemy',
  'explorer',
  'penny',
] as const;

export interface DeckFormatOption {
  value: string;
  label: string;
}

export const DECK_FORMATS: DeckFormatOption[] = [
  ...DECK_FORMAT_CODES.map(code => ({
    value: code,
    label: ALL_FORMATS[code]?.name ?? code,
  })),
  { value: 'custom', label: 'Custom' },
];

const LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  DECK_FORMATS.map(f => [f.value, f.label])
);

export function formatLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return LABEL_BY_CODE[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

/**
 * Power level is a Commander social-contract concept. Showing a "cEDH" band on
 * a Standard deck is nonsense to any player, so every power readout is gated
 * on this.
 */
export function usesPowerLevel(code: string | null | undefined): boolean {
  return code === 'commander' || code === 'brawl' || code === 'oathbreaker';
}

/** Singleton formats show a commander slot and colour-identity legality. */
export function usesCommander(code: string | null | undefined): boolean {
  return code === 'commander' || code === 'brawl' || code === 'oathbreaker';
}
