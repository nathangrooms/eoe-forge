import { motion, AnimatePresence } from 'framer-motion';
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
        <div className="text-lg font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
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
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-md flex items-center justify-center pointer-events-none"
      >
        {/* Particle effects */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{
                opacity: 0.6,
                x: (Math.random() - 0.5) * 400,
                y: (Math.random() - 0.5) * 300,
                scale: Math.random() * 0.5 + 0.5,
              }}
              animate={{
                opacity: [0.6, 0, 0.6],
                scale: [1, 1.5, 1],
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.1,
              }}
              className="absolute w-2 h-2 rounded-full bg-primary/40"
            />
          ))}
        </div>

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
              <span className="text-6xl drop-shadow-2xl">{config.icon}</span>
              <div>
                <div className="text-sm font-bold tracking-[0.3em] uppercase text-primary drop-shadow-lg">
                  {config.badge}
                </div>
                <h2 className="text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]">
                  {config.title}
                </h2>
              </div>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-xl font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
            >
              {config.subtitle}
            </motion.p>
          </div>

          {/* Combat modes with card images */}
          {(mode === 'attack' || mode === 'block' || mode === 'destroy') && (
            <div className="flex flex-col gap-8">
              {attackerCards.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-bold uppercase tracking-wide text-white drop-shadow-lg">⚔️ Attackers</div>
                  <div className="flex flex-wrap justify-center gap-6">
                    {attackerCards.slice(0, 5).map((card, i) => (
                      <CardImage key={card.instanceId} card={card} delay={i * 0.1} />
                    ))}
                  </div>
                </div>
              )}
              
              {blockerCards.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-bold uppercase tracking-wide text-white drop-shadow-lg">🛡️ Blockers</div>
                  <div className="flex flex-wrap justify-center gap-6">
                    {blockerCards.slice(0, 5).map((card, i) => (
                      <CardImage key={card.instanceId} card={card} delay={i * 0.1} />
                    ))}
                  </div>
                </div>
              )}
              
              {destroyedCards.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-bold uppercase tracking-wide text-white drop-shadow-lg">💀 Destroyed</div>
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
                    <div className="text-sm font-medium text-white drop-shadow-lg italic">"{abilityDescription}"</div>
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
                    <div className="text-xl font-bold text-white drop-shadow-lg">{token.name}</div>
                    <div className="text-sm text-white/80 uppercase tracking-wide">Token</div>
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
            <div className="bg-black/30 border border-white/30 rounded-lg px-6 py-4 backdrop-blur-sm">
              <p className="text-base text-white font-medium drop-shadow-lg">
                {config.subtitle}
              </p>
            </div>
          </motion.div>

          {/* Progress bar */}
          <motion.div 
            className="mt-8 h-2 overflow-hidden rounded-full bg-background/50 max-w-md mx-auto"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "100%" }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3.5, ease: 'linear' }}
              className="h-full bg-gradient-to-r from-primary via-accent to-primary"
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
