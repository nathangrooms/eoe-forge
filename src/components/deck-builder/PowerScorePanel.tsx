import React from 'react';
import { PowerScoringEngine } from '@/components/PowerScoringEngine';
import { useDeckStore } from '@/stores/deckStore';

export function PowerScorePanel() {
  const { cards, format } = useDeckStore();

  return <PowerScoringEngine deck={cards} format={format} />;
}