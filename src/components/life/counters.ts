/**
 * DeckMatrix — life counter: the player-level counters worth a dedicated control.
 *
 * `Player.counters` is an open string map in the core, so anything can be
 * tracked. These are the two that come up often enough at a Commander table to
 * earn a permanent row: energy (Kaladesh onwards, and every Aetherdrift deck)
 * and experience (Commander 2015 and friends). Poison is not here — it is a
 * first-class field on `Player` with its own loss condition.
 */

import { Sparkles, Zap } from 'lucide-react';
import type { ComponentType } from 'react';

export const COUNTER_ENERGY = 'energy';
export const COUNTER_EXPERIENCE = 'experience';

export interface CounterDefinition {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

export const TRACKED_COUNTERS: CounterDefinition[] = [
  {
    key: COUNTER_EXPERIENCE,
    label: 'Experience',
    icon: Sparkles,
    description: 'Never removed once gained',
  },
  {
    key: COUNTER_ENERGY,
    label: 'Energy',
    icon: Zap,
    description: 'Spent as a cost',
  },
];
