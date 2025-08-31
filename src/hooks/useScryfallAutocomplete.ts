import { useState, useEffect, useCallback } from 'react';

interface AutocompleteResult {
  object: string;
  total_values: number;
  data: string[];
}

interface UseScryfallAutocompleteResult {
  suggestions: string[];
  loading: boolean;
  error: string | null;
  getSuggestions: (query: string) => Promise<void>;
  clearSuggestions: () => void;
}

// Rate limiting for autocomplete requests
class AutocompleteRateLimit {
  private requests: number[] = [];
  private readonly maxRequests = 10;
  private readonly timeWindow = 1000; // 1 second

  canMakeRequest(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    return this.requests.length < this.maxRequests;
  }

  recordRequest(): void {
    this.requests.push(Date.now());
  }
}

const rateLimiter = new AutocompleteRateLimit();

export function useScryfallAutocomplete(): UseScryfallAutocompleteResult {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const getSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }

    // Cancel previous request
    if (abortController) {
      abortController.abort();
    }

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    // Rate limiting check
    if (!rateLimiter.canMakeRequest()) {
      console.warn('Rate limit reached for autocomplete');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      rateLimiter.recordRequest();
      
      const response = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'User-Agent': 'MTG-Deck-Builder/1.0'
          },
          signal: newAbortController.signal
        }
      );

      if (!response.ok) {
        throw new Error(`Autocomplete failed: ${response.statusText}`);
      }

      const data: AutocompleteResult = await response.json();
      setSuggestions(data.data || []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't update state
        return;
      }
      console.error('Autocomplete error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  }, [abortController]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  }, [abortController]);

  return {
    suggestions,
    loading,
    error,
    getSuggestions,
    clearSuggestions
  };
}