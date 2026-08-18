import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Shield, Skull, Sparkles, Zap, Users, Mountain, CircleOff, CircleDot } from 'lucide-react';
import { GameCard } from '@/lib/simulation/types';
import { FullCardDisplay } from './FullCardDisplay';

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

const CardImage = ({ card, delay = 0 }: { card: GameCard; delay?: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, rotateY: 180 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ duration: 0.5, delay, ease: 'backOut' }}
      className="relative scale-150"
    >
      <FullCardDisplay card={card} compact={false} />
      <div className="absolute -bottom-12 left-0 right-0 text-center">
        <div className="text-lg font-bold text-foreground">
          {card.name}
        </div>
      </div>
    </motion.div>
  );
};

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
          badge: 'Declare attackers',
          title: 'Attacking',
          subtitle: `${attackerCards.length} creature${attackerCards.length === 1 ? '' : 's'} attacking`,
          Icon: Swords,
        };
      case 'block':
        return {
          badge: 'Declare blockers',
          title: 'Blocking',
          subtitle: `${blockerCards.length} creature${blockerCards.length === 1 ? '' : 's'} blocking`,
          Icon: Shield,
        };
      case 'destroy':
        return {
          badge: 'State-based actions',
          title: 'Destroyed',
          subtitle: `${destroyedCards.length} permanent${destroyedCards.length === 1 ? '' : 's'} put into the graveyard`,
          Icon: Skull,
        };
      case 'cast':
        return {
          badge: 'Spell cast',
          title: castCard?.name || 'Spell cast',
          subtitle: `${playerName} casts ${castCard?.type_line || 'a spell'}`,
          Icon: Sparkles,
        };
      case 'ability':
        return {
          badge: 'Ability triggered',
          title: abilitySource?.name || 'Triggered ability',
          subtitle: abilityDescription || 'An ability resolves',
          Icon: Zap,
        };
      case 'tokens':
        return {
          badge: 'Tokens',
          title: 'Tokens created',
          subtitle: `${tokensCreated.reduce((sum, t) => sum + t.count, 0)} token${
            tokensCreated.reduce((sum, t) => sum + t.count, 0) > 1 ? 's' : ''
          } enter the battlefield`,
          Icon: Users,
        };
      case 'ramp':
        return {
          badge: 'Lands',
          title: 'Lands entering',
          subtitle: `${ramppedLands.length} land${ramppedLands.length === 1 ? '' : 's'} enter the battlefield`,
          Icon: Mountain,
        };
      case 'exile':
        return {
          badge: 'Exile',
          title: 'Exiled',
          subtitle: `${exiledCards.length} card${exiledCards.length === 1 ? '' : 's'} moved to exile`,
          Icon: CircleOff,
        };
      default:
        return {
          badge: 'Game event',
          title: 'Action',
          subtitle: 'The game state changed',
          Icon: CircleDot,
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
        transition={{ duration: 0.3 }}
        className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-background/95 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, rotateX: -30 }}
          animate={{ scale: 1, opacity: 1, rotateX: 0 }}
          exit={{ scale: 0.8, opacity: 0, rotateX: 30 }}
          transition={{ duration: 0.4, ease: "backOut" }}
          className="relative max-w-7xl w-full mx-4"
          style={{ perspective: 1000 }}
        >
          {/* Title Section */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: "backOut" }}
              className="flex items-center justify-center gap-4 mb-4"
            >
              <config.Icon className="h-12 w-12 shrink-0 text-foreground" aria-hidden />
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  {config.badge}
                </div>
                <h2 className="text-4xl font-black tracking-tight text-foreground md:text-6xl">
                  {config.title}
                </h2>
              </div>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-lg font-semibold text-muted-foreground"
            >
              {config.subtitle}
            </motion.p>
          </div>

          {/* Combat modes with card images */}
          {(mode === 'attack' || mode === 'block' || mode === 'destroy') && (
            <div className="flex flex-col gap-8">
              {attackerCards.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-bold uppercase tracking-wide text-foreground">Attackers</div>
                  <div className="flex flex-wrap justify-center gap-6">
                    {attackerCards.slice(0, 5).map((card, i) => (
                      <CardImage key={card.instanceId} card={card} delay={i * 0.1} />
                    ))}
                  </div>
                </div>
              )}

              {blockerCards.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-bold uppercase tracking-wide text-foreground">Blockers</div>
                  <div className="flex flex-wrap justify-center gap-6">
                    {blockerCards.slice(0, 5).map((card, i) => (
                      <CardImage key={card.instanceId} card={card} delay={i * 0.1} />
                    ))}
                  </div>
                </div>
              )}

              {destroyedCards.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-bold uppercase tracking-wide text-foreground">Destroyed</div>
                  <div className="flex flex-wrap justify-center gap-6">
                    {destroyedCards.slice(0, 5).map((card, i) => (
                      <CardImage key={card.instanceId} card={card} delay={i * 0.1} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

            {/* Cast spell mode */}
            {mode === 'cast' && castCard && (
              <div className="flex justify-center">
                <CardImage card={castCard} delay={0} />
              </div>
            )}

            {/* Ability trigger mode */}
            {mode === 'ability' && abilitySource && (
              <div className="flex flex-col items-center gap-4">
                <CardImage card={abilitySource} delay={0} />
                {abilityDescription && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-accent/20 border border-accent/40 rounded-lg px-6 py-3 max-w-md"
                  >
                    <div className="text-sm font-medium italic text-foreground">&ldquo;{abilityDescription}&rdquo;</div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Token creation mode */}
            {mode === 'tokens' && tokensCreated.length > 0 && (
              <div className="flex flex-wrap justify-center gap-8">
                {tokensCreated.map((token, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: idx * 0.15, duration: 0.5, ease: "backOut" }}
                    className="bg-primary/20 border-2 border-primary rounded-xl px-8 py-6 flex flex-col items-center gap-2"
                  >
                    <div className="text-7xl font-black text-primary drop-shadow-lg">{token.count}×</div>
                    <div className="text-xl font-bold text-foreground">{token.name}</div>
                    <div className="text-sm uppercase tracking-wide text-muted-foreground">Token</div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Ramp mode */}
            {mode === 'ramp' && ramppedLands.length > 0 && (
              <div className="flex justify-center flex-wrap gap-6">
                {ramppedLands.slice(0, 5).map((land, i) => (
                  <CardImage key={land.instanceId} card={land} delay={i * 0.1} />
                ))}
              </div>
            )}

            {/* Exile mode */}
            {mode === 'exile' && exiledCards.length > 0 && (
              <div className="flex justify-center flex-wrap gap-6">
                {exiledCards.slice(0, 5).map((card, i) => (
                  <CardImage key={card.instanceId} card={card} delay={i * 0.1} />
                ))}
              </div>
            )}

          {/* Descriptive note */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-8 text-center max-w-2xl mx-auto"
          >
            <div className="rounded-lg border border-border bg-card px-6 py-4">
              <p className="text-base font-medium text-foreground">
                {config.subtitle}
              </p>
            </div>
          </motion.div>

          {/* Progress bar */}
          <motion.div
            className="mx-auto mt-8 h-1.5 max-w-md overflow-hidden rounded-full bg-muted"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "100%" }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3.5, ease: 'linear' }}
              className="h-full bg-foreground"
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
