import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useScryfallAutocomplete } from '@/hooks/useScryfallAutocomplete';
import { useScryfallCatalogs } from '@/hooks/useScryfallCatalogs';
import { Search, X, Clock, Sparkles } from 'lucide-react';

interface AutocompleteSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  mode?: 'card-names' | 'types' | 'keywords' | 'general';
}

export function AutocompleteSearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search cards...",
  className = "",
  autoFocus = false,
  mode = 'general'
}: AutocompleteSearchInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { suggestions, loading, getSuggestions, clearSuggestions } = useScryfallAutocomplete();
  const catalogs = useScryfallCatalogs();

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('mtg_recent_searches');
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
    }
  }, []);

  // Get suggestions based on mode
  const getContextualSuggestions = (query: string): string[] => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    let contextSuggestions: string[] = [];

    switch (mode) {
      case 'types':
        contextSuggestions = [
          ...catalogs.cardTypes,
          ...catalogs.supertypes,
          ...catalogs.subtypes,
          ...catalogs.creatureTypes
        ].filter(type => type.toLowerCase().includes(lowerQuery));
        break;
      case 'keywords':
        contextSuggestions = [
          ...catalogs.keywords,
          ...catalogs.abilityWords
        ].filter(keyword => keyword.toLowerCase().includes(lowerQuery));
        break;
      default:
        contextSuggestions = [];
    }

    return contextSuggestions.slice(0, 8);
  };

  // Debounced autocomplete
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value.trim() && value.length >= 2) {
        getSuggestions(value);
      } else {
        clearSuggestions();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, getSuggestions, clearSuggestions]);

  // Combine suggestions with contextual ones
  const allSuggestions = React.useMemo(() => {
    const contextual = getContextualSuggestions(value);
    const combined = [...new Set([...suggestions, ...contextual])];
    return combined.slice(0, 8);
  }, [suggestions, value, mode, catalogs]);

  // Show recent searches when input is empty and focused
  const displaySuggestions = value.trim() ? allSuggestions : recentSearches;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(0);
    setShowSuggestions(true);
  };

  const handleSubmit = () => {
    if (value.trim()) {
      // Add to recent searches
      const newRecent = [value, ...recentSearches.filter(s => s !== value)].slice(0, 5);
      setRecentSearches(newRecent);
      localStorage.setItem('mtg_recent_searches', JSON.stringify(newRecent));
    }
    
    setShowSuggestions(false);
    onSubmit();
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setTimeout(() => {
      inputRef.current?.focus();
      handleSubmit();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || displaySuggestions.length === 0) {
      if (e.key === 'Enter') {
        handleSubmit();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < displaySuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : displaySuggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (displaySuggestions[selectedIndex]) {
          handleSuggestionClick(displaySuggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
      case 'Tab':
        if (displaySuggestions[selectedIndex]) {
          e.preventDefault();
          onChange(displaySuggestions[selectedIndex]);
        }
        break;
    }
  };

  const handleFocus = () => {
    setShowSuggestions(true);
    setSelectedIndex(0);
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow clicking
    setTimeout(() => setShowSuggestions(false), 150);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pl-10 pr-10"
          autoFocus={autoFocus}
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {loading && (
          <div className="absolute right-8 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && displaySuggestions.length > 0 && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-hidden border shadow-lg">
          <CardContent className="p-0">
            <div ref={suggestionsRef} className="max-h-80 overflow-y-auto">
              {!value.trim() && recentSearches.length > 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-b flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Recent Searches
                </div>
              )}
              
              {value.trim() && mode !== 'general' && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-b flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Suggestions
                </div>
              )}

              {displaySuggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`
                    px-3 py-2 cursor-pointer transition-colors text-sm
                    ${index === selectedIndex 
                      ? 'bg-accent text-accent-foreground' 
                      : 'hover:bg-accent/50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span>{suggestion}</span>
                    {!value.trim() && (
                      <Badge variant="outline" className="text-xs ml-2">
                        Recent
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}