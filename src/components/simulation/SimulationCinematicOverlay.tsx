import { motion, AnimatePresence } from 'framer-motion';
import { GameCard } from '@/lib/simulation/types';

interface SimulationCinematicOverlayProps {
  mode: 'attack' | 'block' | 'destroy' | 'cast' | 'ability' | 'tokens' | 'ramp' | 'exile';
  attackerCards?: GameCard[];
  blockerCards?: GameCard[];
  destroyedCards?: GameCard[];
  castCard?: GameCard;
  abilitySource?: GameCard;
  abilityDescription?: string;
  tokensCreated?: Array<{ name: string; count: number }>;
  ramppedLands?: GameCard[];
  exiledCards?: GameCard[];
  playerName?: string;
}

export const SimulationCinematicOverlay = ({
  mode,
  attackerCards = [],
  blockerCards = [],
  destroyedCards = [],
  castCard,
  abilitySource,
  abilityDescription,
  tokensCreated = [],
  ramppedLands = [],
  exiledCards = [],
  playerName = 'Player',
}: SimulationCinematicOverlayProps) => {
  const getModeConfig = () => {
    switch (mode) {
      case 'attack':
        return {
          badge: 'Combat Phase',
          title: 'All-Out Assault',
          subtitle: 'Attackers are charging into battle',
          icon: '⚔️',
        };
      case 'block':
        return {
          badge: 'Defense Phase',
          title: 'Defensive Wall',
          subtitle: 'Blockers step in to absorb the damage',
          icon: '🛡️',
        };
      case 'destroy':
        return {
          badge: 'Resolution',
          title: 'Devastating Blow',
          subtitle: 'Creatures are destroyed in a flash of power',
          icon: '💀',
        };
      case 'cast':
        return {
          badge: 'Spell Cast',
          title: castCard?.name || 'Spell Unleashed',
          subtitle: `${playerName} casts ${castCard?.type_line || 'a spell'}`,
          icon: '✨',
        };
      case 'ability':
        return {
          badge: 'Ability Triggered',
          title: abilitySource?.name || 'Effect',
          subtitle: abilityDescription || 'A powerful effect resolves',
          icon: '⚡',
        };
      case 'tokens':
        return {
          badge: 'Summoning',
          title: 'Creatures Emerge',
          subtitle: `${tokensCreated.reduce((sum, t) => sum + t.count, 0)} token${
            tokensCreated.reduce((sum, t) => sum + t.count, 0) > 1 ? 's' : ''
          } enter the battlefield`,
          icon: '🎭',
        };
      case 'ramp':
        return {
          badge: 'Mana Surge',
          title: 'Lands Awakened',
          subtitle: `${ramppedLands.length} land${ramppedLands.length > 1 ? 's' : ''} join the battlefield`,
          icon: '🌿',
        };
      case 'exile':
        return {
          badge: 'Banishment',
          title: 'Exiled',
          subtitle: 'Cards are banished from existence',
          icon: '🌀',
        };
      default:
        return {
          badge: 'Game Event',
          title: 'Action',
          subtitle: 'Something happened',
          icon: '❓',
        };
    }
  };

  const config = getModeConfig();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-xl flex items-center justify-center pointer-events-none"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative max-w-5xl w-full mx-4 rounded-3xl border border-primary/40 bg-gradient-to-br from-background via-primary/10 to-background shadow-2xl overflow-hidden"
        >
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute -left-16 -top-16 w-64 h-64 rounded-full bg-primary/40 blur-3xl" />
            <div className="absolute -right-10 -bottom-10 w-72 h-72 rounded-full bg-accent/40 blur-3xl" />
          </div>

          <div className="relative px-8 pt-8 pb-6 flex flex-col gap-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{config.icon}</span>
                  <div className="text-xs font-semibold tracking-[0.25em] uppercase text-muted-foreground">
                    {config.badge}
                  </div>
                </div>
                <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-primary via-accent to-primary-foreground bg-clip-text text-transparent">
                  {config.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md">{config.subtitle}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground hidden sm:block">
                <div className="font-semibold">Cinematic View</div>
                <div className="opacity-80">Auto-plays on key moments</div>
              </div>
            </div>

            {/* Combat modes */}
            {(mode === 'attack' || mode === 'block' || mode === 'destroy') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                <div className="sm:col-span-1 flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attackers</div>
                  <div className="flex flex-wrap gap-2">
                    {attackerCards.map((card) => (
                      <div
                        key={card.instanceId}
                        className="px-3 py-1.5 rounded-full bg-primary/15 border border-primary/40 text-xs font-semibold text-primary-foreground/90"
                      >
                        {card.name}
                      </div>
                    ))}
                    {attackerCards.length === 0 && (
                      <div className="text-xs text-muted-foreground italic">No attackers</div>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-1 flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blockers</div>
                  <div className="flex flex-wrap gap-2">
                    {blockerCards.map((card) => (
                      <div
                        key={card.instanceId}
                        className="px-3 py-1.5 rounded-full bg-accent/20 border border-accent/40 text-xs font-semibold text-accent-foreground/90"
                      >
                        {card.name}
                      </div>
                    ))}
                    {blockerCards.length === 0 && (
                      <div className="text-xs text-muted-foreground italic">No blockers assigned</div>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-1 flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {mode === 'destroy' ? 'Destroyed' : 'At Risk'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {destroyedCards.map((card) => (
                      <div
                        key={card.instanceId}
                        className="px-3 py-1.5 rounded-full bg-destructive/20 border border-destructive/40 text-xs font-semibold text-destructive/90"
                      >
                        {card.name}
                      </div>
                    ))}
                    {destroyedCards.length === 0 && (
                      <div className="text-xs text-muted-foreground italic">No creatures destroyed yet</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Cast spell mode */}
            {mode === 'cast' && castCard && (
              <div className="space-y-3">
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Spell Details
                  </div>
                  <div className="text-lg font-bold text-primary-foreground">{castCard.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{castCard.type_line}</div>
                  {castCard.mana_cost && (
                    <div className="text-xs text-accent mt-2 font-mono">{castCard.mana_cost}</div>
                  )}
                  {castCard.oracle_text && (
                    <div className="text-xs text-muted-foreground mt-3 line-clamp-3">{castCard.oracle_text}</div>
                  )}
                </div>
              </div>
            )}

            {/* Ability trigger mode */}
            {mode === 'ability' && abilitySource && (
              <div className="space-y-3">
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Triggered By
                  </div>
                  <div className="text-lg font-bold text-accent-foreground">{abilitySource.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{abilitySource.type_line}</div>
                  {abilityDescription && (
                    <div className="mt-3 text-sm text-accent-foreground/90 italic">"{abilityDescription}"</div>
                  )}
                </div>
              </div>
            )}

            {/* Token creation mode */}
            {mode === 'tokens' && tokensCreated.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Tokens Created
                </div>
                <div className="flex flex-wrap gap-3">
                  {tokensCreated.map((token, idx) => (
                    <div
                      key={idx}
                      className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 flex items-center gap-3"
                    >
                      <div className="text-3xl font-black text-primary">{token.count}×</div>
                      <div>
                        <div className="text-sm font-bold text-primary-foreground">{token.name}</div>
                        <div className="text-xs text-muted-foreground">Token</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ramp mode */}
            {mode === 'ramp' && ramppedLands.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Lands Enter Tapped
                </div>
                <div className="flex flex-wrap gap-2">
                  {ramppedLands.map((land) => (
                    <div
                      key={land.instanceId}
                      className="px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/40 text-xs font-semibold text-green-300"
                    >
                      {land.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exile mode */}
            {mode === 'exile' && exiledCards.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Banished Forever
                </div>
                <div className="flex flex-wrap gap-2">
                  {exiledCards.map((card) => (
                    <div
                      key={card.instanceId}
                      className="px-3 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/40 text-xs font-semibold text-purple-300"
                    >
                      {card.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-muted/60">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-primary via-accent to-primary-foreground"
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
