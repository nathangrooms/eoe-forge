export type BadgeId = 
  | 'deck_master_bronze' | 'deck_master_silver' | 'deck_master_gold' | 'deck_master_platinum'
  | 'collector_bronze' | 'collector_silver' | 'collector_gold' | 'collector_platinum'
  | 'investor_bronze' | 'investor_silver' | 'investor_gold' | 'investor_platinum'
  | 'strategist_bronze' | 'strategist_silver' | 'strategist_gold' | 'strategist_platinum';

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  category: 'deck_master' | 'collector' | 'investor' | 'strategist';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  requirement: number;
  icon: string;
}

export const BADGES: Badge[] = [
  // Deck Master - Based on number of decks
  { id: 'deck_master_bronze', name: 'Deck Apprentice', description: 'Create 3 decks', category: 'deck_master', tier: 'bronze', requirement: 3, icon: '🎴' },
  { id: 'deck_master_silver', name: 'Deck Builder', description: 'Create 10 decks', category: 'deck_master', tier: 'silver', requirement: 10, icon: '🎴' },
  { id: 'deck_master_gold', name: 'Deck Master', description: 'Create 25 decks', category: 'deck_master', tier: 'gold', requirement: 25, icon: '🎴' },
  { id: 'deck_master_platinum', name: 'Deck Legend', description: 'Create 50 decks', category: 'deck_master', tier: 'platinum', requirement: 50, icon: '🎴' },
  
  // Collector - Based on unique cards
  { id: 'collector_bronze', name: 'Card Gatherer', description: 'Collect 50 unique cards', category: 'collector', tier: 'bronze', requirement: 50, icon: '📚' },
  { id: 'collector_silver', name: 'Card Collector', description: 'Collect 250 unique cards', category: 'collector', tier: 'silver', requirement: 250, icon: '📚' },
  { id: 'collector_gold', name: 'Card Curator', description: 'Collect 1,000 unique cards', category: 'collector', tier: 'gold', requirement: 1000, icon: '📚' },
  { id: 'collector_platinum', name: 'Card Archivist', description: 'Collect 5,000 unique cards', category: 'collector', tier: 'platinum', requirement: 5000, icon: '📚' },
  
  // Investor - Based on collection value
  { id: 'investor_bronze', name: 'Value Seeker', description: 'Collection worth $100', category: 'investor', tier: 'bronze', requirement: 100, icon: '💎' },
  { id: 'investor_silver', name: 'Value Builder', description: 'Collection worth $500', category: 'investor', tier: 'silver', requirement: 500, icon: '💎' },
  { id: 'investor_gold', name: 'Investor', description: 'Collection worth $2,500', category: 'investor', tier: 'gold', requirement: 2500, icon: '💎' },
  { id: 'investor_platinum', name: 'High Roller', description: 'Collection worth $10,000', category: 'investor', tier: 'platinum', requirement: 10000, icon: '💎' },
  
  // Strategist - Based on total cards owned
  { id: 'strategist_bronze', name: 'Card Player', description: 'Own 100 cards', category: 'strategist', tier: 'bronze', requirement: 100, icon: '⚔️' },
  { id: 'strategist_silver', name: 'Card Tactician', description: 'Own 500 cards', category: 'strategist', tier: 'silver', requirement: 500, icon: '⚔️' },
  { id: 'strategist_gold', name: 'Strategist', description: 'Own 2,000 cards', category: 'strategist', tier: 'gold', requirement: 2000, icon: '⚔️' },
  { id: 'strategist_platinum', name: 'Master Strategist', description: 'Own 10,000 cards', category: 'strategist', tier: 'platinum', requirement: 10000, icon: '⚔️' },
];

export interface BadgeProgress {
  badge: Badge;
  earned: boolean;
  progress: number; // 0-100
  currentValue: number;
}

export interface DashboardStats {
  decksCount: number;
  uniqueCards: number;
  collectionValue: number;
  totalCards: number;
}

export function calculateBadgeProgress(stats: DashboardStats): BadgeProgress[] {
  const progressList: BadgeProgress[] = [];

  for (const badge of BADGES) {
    let currentValue = 0;
    
    switch (badge.category) {
      case 'deck_master':
        currentValue = stats.decksCount;
        break;
      case 'collector':
        currentValue = stats.uniqueCards;
        break;
      case 'investor':
        currentValue = stats.collectionValue;
        break;
      case 'strategist':
        currentValue = stats.totalCards;
        break;
    }

    const progress = Math.min(100, (currentValue / badge.requirement) * 100);
    const earned = currentValue >= badge.requirement;

    progressList.push({
      badge,
      earned,
      progress,
      currentValue,
    });
  }

  return progressList;
}

export function getNextBadgeInCategory(category: string, progressList: BadgeProgress[]): BadgeProgress | null {
  const categoryBadges = progressList.filter(bp => bp.badge.category === category && !bp.earned);
  return categoryBadges.length > 0 ? categoryBadges[0] : null;
}

export function getEarnedBadges(progressList: BadgeProgress[]): BadgeProgress[] {
  return progressList.filter(bp => bp.earned).sort((a, b) => {
    const tierOrder = { platinum: 4, gold: 3, silver: 2, bronze: 1 };
    return tierOrder[b.badge.tier] - tierOrder[a.badge.tier];
  });
}

export function getInProgressBadges(progressList: BadgeProgress[]): BadgeProgress[] {
  const categories = ['deck_master', 'collector', 'investor', 'strategist'];
  const nextBadges = categories
    .map(cat => getNextBadgeInCategory(cat, progressList))
    .filter((badge): badge is BadgeProgress => badge !== null)
    .sort((a, b) => b.progress - a.progress);
  
  return nextBadges;
}
