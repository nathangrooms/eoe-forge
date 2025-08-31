import { useEffect, useCallback } from 'react';

interface KeyboardShortcutOptions {
  onSearch?: () => void;
  onAdvancedSearch?: () => void;
  onFocusSearch?: () => void;
  onClearSearch?: () => void;
  onToggleMode?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts({
  onSearch,
  onAdvancedSearch,
  onFocusSearch,
  onClearSearch,
  onToggleMode,
  onEscape
}: KeyboardShortcutOptions) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when user is typing in input fields
    const target = event.target as HTMLElement;
    const isInputField = target.tagName === 'INPUT' || 
                        target.tagName === 'TEXTAREA' || 
                        target.contentEditable === 'true';

    // Global shortcuts (work everywhere)
    if (event.key === '/' && !isInputField) {
      event.preventDefault();
      onFocusSearch?.();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }

    // Shortcuts that work in input fields
    if (isInputField) {
      // Enter to search
      if (event.key === 'Enter' && !event.shiftKey) {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          onAdvancedSearch?.();
        } else {
          event.preventDefault();
          onSearch?.();
        }
        return;
      }

      // Ctrl/Cmd + K to clear
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        onClearSearch?.();
        return;
      }
    }

    // Global shortcuts for mode toggle
    if ((event.ctrlKey || event.metaKey) && event.key === 'm' && !isInputField) {
      event.preventDefault();
      onToggleMode?.();
      return;
    }

  }, [onSearch, onAdvancedSearch, onFocusSearch, onClearSearch, onToggleMode, onEscape]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return null;
}