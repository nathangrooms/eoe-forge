import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Arrow {
  id: string;
  fromId: string;
  toId: string;
}

interface CombatArrowsProps {
  attackers: Array<{ instanceId: string; blockedBy: string[] }>;
  blockers: Array<{ instanceId: string; blocking: string }>;
}

export const CombatArrows = ({ attackers, blockers }: CombatArrowsProps) => {
  const [arrows, setArrows] = useState<Arrow[]>([]);

  useEffect(() => {
    const newArrows: Arrow[] = [];
    
    // Create arrows from attackers to blockers
    blockers.forEach(blocker => {
      newArrows.push({
        id: `${blocker.blocking}-${blocker.instanceId}`,
        fromId: blocker.blocking,
        toId: blocker.instanceId
      });
    });

    // Create arrows from unblocked attackers to player
    attackers.forEach(attacker => {
      if (attacker.blockedBy.length === 0) {
        newArrows.push({
          id: `${attacker.instanceId}-player`,
          fromId: attacker.instanceId,
          toId: 'player'
        });
      }
    });

    setArrows(newArrows);
  }, [attackers, blockers]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence>
        {arrows.map(arrow => (
          <motion.div
            key={arrow.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute"
          >
            {/* Animated arrow path */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <marker
                  id={`arrowhead-${arrow.id}`}
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
                </marker>
              </defs>
              <motion.path
                d="M 100 100 L 200 200"
                stroke="#ef4444"
                strokeWidth="4"
                fill="none"
                markerEnd={`url(#arrowhead-${arrow.id})`}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
