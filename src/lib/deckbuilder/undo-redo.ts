/**
 * Undo/Redo System for Deck Building
 * 
 * Tracks deck modifications and allows users to undo/redo actions
 */

export type DeckAction = 
  | { type: 'ADD_CARD'; cardId: string; cardName: string; quantity: number; isCommander?: boolean }
  | { type: 'REMOVE_CARD'; cardId: string; cardName: string; quantity: number }
  | { type: 'UPDATE_QUANTITY'; cardId: string; cardName: string; oldQuantity: number; newQuantity: number }
  | { type: 'SET_COMMANDER'; cardId: string; cardName: string; previousCommanderId?: string }
  | { type: 'REMOVE_COMMANDER'; cardId: string; cardName: string }
  | { type: 'BULK_ADD'; cards: Array<{ cardId: string; cardName: string; quantity: number }> }
  | { type: 'BULK_REMOVE'; cards: Array<{ cardId: string; cardName: string; quantity: number }> };

export interface DeckHistoryState {
  cards: Map<string, { name: string; quantity: number; isCommander: boolean }>;
  commanderId: string | null;
  timestamp: number;
}

export class DeckHistoryManager {
  private history: DeckHistoryState[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 50;

  constructor(maxHistorySize: number = 50) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Record current deck state
   */
  recordState(cards: Map<string, { name: string; quantity: number; isCommander: boolean }>, commanderId: string | null) {
    // Remove any states after current index (if we're not at the end)
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new state
    const newState: DeckHistoryState = {
      cards: new Map(cards),
      commanderId,
      timestamp: Date.now()
    };

    this.history.push(newState);

    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  /**
   * Undo to previous state
   */
  undo(): DeckHistoryState | null {
    if (!this.canUndo()) return null;
    
    this.currentIndex--;
    return this.getCurrentState();
  }

  /**
   * Redo to next state
   */
  redo(): DeckHistoryState | null {
    if (!this.canRedo()) return null;
    
    this.currentIndex++;
    return this.getCurrentState();
  }

  /**
   * Get current state
   */
  getCurrentState(): DeckHistoryState | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
      return null;
    }
    return this.history[this.currentIndex];
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get action description for UI
   */
  getUndoDescription(): string | null {
    if (!this.canUndo() || this.currentIndex <= 0) return null;
    
    const current = this.history[this.currentIndex];
    const previous = this.history[this.currentIndex - 1];
    
    return this.describeStateDifference(previous, current);
  }

  /**
   * Get action description for redo
   */
  getRedoDescription(): string | null {
    if (!this.canRedo()) return null;
    
    const current = this.history[this.currentIndex];
    const next = this.history[this.currentIndex + 1];
    
    return this.describeStateDifference(current, next);
  }

  /**
   * Describe difference between two states
   */
  private describeStateDifference(from: DeckHistoryState, to: DeckHistoryState): string {
    // Check commander change
    if (from.commanderId !== to.commanderId) {
      if (to.commanderId) {
        const card = to.cards.get(to.commanderId);
        return `Set commander: ${card?.name}`;
      } else {
        return 'Remove commander';
      }
    }

    // Check for added cards
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    to.cards.forEach((toCard, cardId) => {
      const fromCard = from.cards.get(cardId);
      if (!fromCard) {
        added.push(`${toCard.name} (${toCard.quantity})`);
      } else if (fromCard.quantity !== toCard.quantity) {
        modified.push(`${toCard.name} (${fromCard.quantity} → ${toCard.quantity})`);
      }
    });

    from.cards.forEach((fromCard, cardId) => {
      if (!to.cards.has(cardId)) {
        removed.push(`${fromCard.name} (${fromCard.quantity})`);
      }
    });

    if (added.length > 0) {
      if (added.length === 1) return `Add ${added[0]}`;
      return `Add ${added.length} cards`;
    }

    if (removed.length > 0) {
      if (removed.length === 1) return `Remove ${removed[0]}`;
      return `Remove ${removed.length} cards`;
    }

    if (modified.length > 0) {
      if (modified.length === 1) return `Update ${modified[0]}`;
      return `Update ${modified.length} cards`;
    }

    return 'Deck modification';
  }

  /**
   * Clear all history
   */
  clear() {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get history size
   */
  size(): number {
    return this.history.length;
  }

  /**
   * Export history for persistence
   */
  export(): string {
    return JSON.stringify({
      history: this.history.map(state => ({
        cards: Array.from(state.cards.entries()),
        commanderId: state.commanderId,
        timestamp: state.timestamp
      })),
      currentIndex: this.currentIndex
    });
  }

  /**
   * Import history from persistence
   */
  import(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      this.history = parsed.history.map((state: any) => ({
        cards: new Map(state.cards),
        commanderId: state.commanderId,
        timestamp: state.timestamp
      }));
      this.currentIndex = parsed.currentIndex;
      return true;
    } catch (error) {
      console.error('Failed to import history:', error);
      return false;
    }
  }
}

/**
 * Keyboard shortcuts handler for undo/redo
 */
export function setupUndoRedoShortcuts(
  onUndo: () => void,
  onRedo: () => void
): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    }
    
    // Ctrl+Shift+Z or Cmd+Shift+Z for redo
    // Also support Ctrl+Y or Cmd+Y
    if ((e.ctrlKey || e.metaKey) && (
      (e.key === 'z' && e.shiftKey) || 
      e.key === 'y'
    )) {
      e.preventDefault();
      onRedo();
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
