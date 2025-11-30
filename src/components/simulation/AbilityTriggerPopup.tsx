import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Trigger {
  id: string;
  cardName: string;
  ability: string;
  timestamp: number;
}

export const AbilityTriggerPopup = ({ triggers }: { triggers: Trigger[] }) => {
  return (
    <div className="fixed top-20 right-8 z-[90] pointer-events-none space-y-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {triggers.map((trigger) => (
          <motion.div
            key={trigger.id}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="bg-accent/95 backdrop-blur-sm px-4 py-3 rounded-lg shadow-xl border border-accent-foreground/20"
          >
            <div className="text-xs font-bold text-accent-foreground/70 uppercase tracking-wide">
              ⚡ Triggered
            </div>
            <div className="text-sm font-bold text-accent-foreground mt-1">
              {trigger.cardName}
            </div>
            <div className="text-xs text-accent-foreground/80 mt-1 line-clamp-2">
              {trigger.ability}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export const useAbilityTriggers = () => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);

  const showTrigger = (cardName: string, ability: string) => {
    const id = `${cardName}-${Date.now()}`;
    const trigger: Trigger = { id, cardName, ability, timestamp: Date.now() };
    
    setTriggers(prev => [...prev, trigger]);

    setTimeout(() => {
      setTriggers(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  return { triggers, showTrigger };
};
