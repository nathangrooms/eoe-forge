import { cn } from '@/lib/utils';

/**
 * Renders a Scryfall mana cost string as proper pips.
 *
 * Mana costs were previously printed as raw text — a deck builder showing
 * "{2}{W}{U}" instead of pips reads as broken to any Magic player, so this is
 * the canonical renderer for every surface that displays a cost.
 *
 * Handles generic ({3}, {X}), coloured ({W}), hybrid ({W/U}), monocoloured
 * hybrid ({2/W}), phyrexian ({W/P}), snow ({S}) and colourless ({C}).
 */

type PipStyle = { bg: string; fg: string };

const COLOR_PIP: Record<string, PipStyle> = {
  W: { bg: 'hsl(var(--mana-white))', fg: 'hsl(0 0% 12%)' },
  U: { bg: 'hsl(var(--mana-blue))', fg: 'hsl(0 0% 100%)' },
  B: { bg: 'hsl(var(--mana-black))', fg: 'hsl(0 0% 100%)' },
  R: { bg: 'hsl(var(--mana-red))', fg: 'hsl(0 0% 100%)' },
  G: { bg: 'hsl(var(--mana-green))', fg: 'hsl(0 0% 100%)' },
  C: { bg: 'hsl(var(--mana-colorless))', fg: 'hsl(0 0% 12%)' },
  S: { bg: 'hsl(var(--mana-colorless))', fg: 'hsl(0 0% 12%)' },
};

const GENERIC_PIP: PipStyle = {
  bg: 'hsl(var(--muted))',
  fg: 'hsl(var(--muted-foreground))',
};

const SIZES = {
  xs: 'h-3.5 w-3.5 text-[9px]',
  sm: 'h-4 w-4 text-[10px]',
  md: 'h-5 w-5 text-[11px]',
  lg: 'h-6 w-6 text-xs',
} as const;

export type ManaCostSize = keyof typeof SIZES;

/** Split "{2}{W/U}{G}" into ["2", "W/U", "G"]. */
export function parseManaCost(cost: string | null | undefined): string[] {
  if (!cost) return [];
  return Array.from(cost.matchAll(/\{([^}]+)\}/g)).map(m => m[1]);
}

function pipStyle(symbol: string): PipStyle {
  const s = symbol.toUpperCase();

  // Hybrid / phyrexian: colour the pip by its first coloured half.
  if (s.includes('/')) {
    const half = s.split('/').find(p => COLOR_PIP[p]);
    if (half) return COLOR_PIP[half];
    return GENERIC_PIP;
  }
  return COLOR_PIP[s] ?? GENERIC_PIP;
}

/** Display text inside the pip — hybrids are too wide to spell out. */
function pipLabel(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    if (b === 'P') return a; // phyrexian
    return a;
  }
  return s;
}

export function ManaPip({
  symbol, size = 'sm', className,
}: { symbol: string; size?: ManaCostSize; className?: string }) {
  const style = pipStyle(symbol);
  const hybrid = symbol.includes('/');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none',
        'ring-1 ring-inset ring-black/10 dark:ring-white/10',
        SIZES[size],
        className
      )}
      style={{ backgroundColor: style.bg, color: style.fg }}
      title={`{${symbol}}`}
      aria-label={`${symbol} mana`}
    >
      {pipLabel(symbol)}
      {hybrid && <span className="ml-px text-[0.6em] opacity-70">/</span>}
    </span>
  );
}

export function ManaCost({
  cost, size = 'sm', className,
}: { cost: string | null | undefined; size?: ManaCostSize; className?: string }) {
  const symbols = parseManaCost(cost);
  if (symbols.length === 0) return null;

  return (
    <span className={cn('inline-flex items-center gap-0.5 align-middle', className)}>
      {symbols.map((s, i) => (
        <ManaPip key={`${s}-${i}`} symbol={s} size={size} />
      ))}
    </span>
  );
}

/** Colour identity as pips, in canonical WUBRG order. */
export function ColorIdentity({
  colors, size = 'sm', className,
}: { colors: string[] | null | undefined; size?: ManaCostSize; className?: string }) {
  const order = ['W', 'U', 'B', 'R', 'G'];
  const sorted = [...(colors ?? [])].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  if (sorted.length === 0) {
    return <ManaPip symbol="C" size={size} className={className} />;
  }
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {sorted.map(c => <ManaPip key={c} symbol={c} size={size} />)}
    </span>
  );
}

export default ManaCost;
