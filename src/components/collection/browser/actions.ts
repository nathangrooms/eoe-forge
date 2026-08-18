import type { LucideIcon } from 'lucide-react';
import type { BrowserCard } from './types';

/** A per-card action. Every action rendered here has a handler — no inert menu items. */
export interface BrowserAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: (card: BrowserCard) => void;
  destructive?: boolean;
}
