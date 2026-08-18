import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Zap } from 'lucide-react';

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
            className="rounded-lg border border-border bg-popover px-4 py-3 shadow-md"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Zap className="h-3 w-3" aria-hidden />
              Triggered
            </div>
            <div className="mt-1 text-sm font-bold text-popover-foreground">
              {trigger.cardName}
            </div>
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
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
