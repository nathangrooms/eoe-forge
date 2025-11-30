import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DamageNumber {
  id: string;
  amount: number;
  timestamp: number;
}

export const FloatingDamage = ({ cardId, damages }: { cardId: string; damages: DamageNumber[] }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {damages.map((damage) => (
          <motion.div
            key={damage.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -40, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="text-4xl font-black text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
              -{damage.amount}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export const useDamageNumbers = () => {
  const [damages, setDamages] = useState<Map<string, DamageNumber[]>>(new Map());

  const showDamage = (cardId: string, amount: number) => {
    const id = `${cardId}-${Date.now()}`;
    const damage: DamageNumber = { id, amount, timestamp: Date.now() };
    
    setDamages(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(cardId) || [];
      newMap.set(cardId, [...existing, damage]);
      return newMap;
    });

    // Clean up after animation
    setTimeout(() => {
      setDamages(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(cardId) || [];
        newMap.set(cardId, existing.filter(d => d.id !== id));
        return newMap;
      });
    }, 1500);
  };

  return { damages, showDamage };
};
