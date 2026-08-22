import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FIELD, SEARCH_DEBOUNCE_MS } from './listing-view';

/**
 * The search field.
 *
 * There were three of these, differing only in the debounce and the
 * placeholder, plus four surfaces that filtered on every keystroke because they
 * had no debounce at all. This is the union of what the three did, not the
 * intersection:
 *
 * - **Debounced commit** (`CollectionBrowser`) so a 4,000 card collection is
 *   not re-filtered per character.
 * - **Adopts external change without stomping on typing** (`CollectionBrowser`,
 *   `CardFilterPanel`). Clearing a chip elsewhere resets the box; a slow typist
 *   is not interrupted by a re-render.
 * - **Enter commits immediately** (`EnhancedUniversalCardSearch`), because a
 *   player who has finished typing should not wait out a timer.
 * - **A clear control inside the field** (`CardFilterPanel`).
 *
 * ## The slots
 *
 * `suggestions` draws under the field, which is where card search puts its
 * Scryfall name autocomplete. `trailing` sits inside the field before the clear
 * control, for a key hint or a syntax help affordance. Neither is a mode: a
 * page that passes nothing gets a plain field, and this component never learns
 * what a card is.
 */

export interface ListingSearchProps {
  /** The committed text. This is state the page owns, not the draft. */
  value: string;
  /** Called with the settled text, or `undefined` when the box is empty. */
  onCommit: (next: string | undefined) => void;
  placeholder: string;
  /** Announced to screen readers. "Search cards", "Search your decks". */
  label?: string;
  /** Override only with a measured reason. See `SEARCH_DEBOUNCE_MS`. */
  debounceMs?: number;
  autoFocus?: boolean;
  /** So a page can focus the box from a keyboard shortcut. */
  inputRef?: RefObject<HTMLInputElement>;
  /** Fired on Enter, after the text is committed. */
  onSubmit?: (text: string) => void;
  /** Slot: rendered under the field. Autocomplete, recent searches. */
  suggestions?: ReactNode;
  /**
   * The uncommitted text, on every keystroke.
   *
   * `value` is what the page has committed; this is what is in the box right
   * now. A name autocomplete has to run against the second one, because
   * suggesting completions for text the reader has already finished typing is
   * suggesting nothing. Card search is the one surface that has this, and it is
   * why the box could not simply be swapped in there.
   *
   * Do NOT filter results off this. That is what the debounce exists to
   * prevent, and it is the bug four surfaces had.
   */
  onDraftChange?: (draft: string) => void;
  /**
   * The box gained or lost focus, so a page drawing its own dropdown in
   * `suggestions` can close it when the reader clicks away.
   */
  onFocusChange?: (focused: boolean) => void;
  /** Slot: rendered inside the field, right side. */
  trailing?: ReactNode;
  className?: string;
  /** Field height. `h-11` on a page whose search is the main event. */
  size?: 'default' | 'large';
}

export function ListingSearch({
  value,
  onCommit,
  placeholder,
  label = 'Search',
  debounceMs = SEARCH_DEBOUNCE_MS,
  autoFocus,
  inputRef,
  onSubmit,
  suggestions,
  onDraftChange,
  onFocusChange,
  trailing,
  className,
  size = 'default',
}: ListingSearchProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  // Adopt an outside change (a chip removed, "clear all", a shared link) and
  // leave a draft mid-word alone. Comparing against the last committed value
  // rather than against the draft is what tells those two cases apart.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  /* Reported from an effect rather than from `onChange`, so a draft the box
     adopted from outside (a chip removed, a suggestion picked) is reported too.
     The ref keeps the effect from depending on a callback the caller may not
     have memoised, which is the mistake the debounce comment below describes. */
  const draftListener = useRef(onDraftChange);
  draftListener.current = onDraftChange;
  useEffect(() => {
    draftListener.current?.(draft);
  }, [draft]);

  /*
   * The timer keys on `onCommit`, so a caller handing in a fresh closure every
   * render would restart the debounce forever and the box would never commit.
   * `useCardFilterState` keeps `patch` stable for exactly this reason; a page
   * with its own handler should wrap it in `useCallback`.
   */
  useEffect(() => {
    if (draft === committed.current) return;
    const id = window.setTimeout(() => {
      committed.current = draft;
      onCommit(draft.trim() ? draft : undefined);
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [draft, debounceMs, onCommit]);

  const commitNow = useCallback(
    (text: string) => {
      committed.current = text;
      onCommit(text.trim() ? text : undefined);
      onSubmit?.(text);
    },
    [onCommit, onSubmit]
  );

  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => onFocusChange?.(true)}
        /* Deferred, because a click on a suggestion drawn below the field is a
           blur before it is a click. Without the delay the dropdown unmounts
           under the pointer and the click lands on nothing. */
        onBlur={() => window.setTimeout(() => onFocusChange?.(false), 140)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitNow(draft);
          }
          if (e.key === 'Escape' && draft) {
            e.preventDefault();
            setDraft('');
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        className={cn(FIELD, 'w-full pl-9', size === 'large' ? 'h-11 text-base' : 'h-9', trailing || draft ? 'pr-16' : 'pr-3')}
      />

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {trailing}
        {draft && (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              commitNow('');
            }}
            aria-label="Clear search"
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {suggestions}
    </div>
  );
}

/**
 * Search text kept in the query string, for a surface with no filter controller
 * of its own.
 *
 * Pages driving the shared card filter already get this: `text` lives in
 * `CardSearchState` and `useCardFilterState` mirrors it into the URL. My Decks,
 * precons and templates have no such state, which is why a filtered deck list
 * is not something you can send anybody and why the back button does not undo a
 * search there. This closes that without giving them a filter system they do
 * not need.
 *
 * `replace: true`, deliberately: typing should not deposit a history entry per
 * word. The page you arrived on stays the page the back button returns to.
 */
export function useSearchText(key = 'q'): [string, (next: string | undefined) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? '';

  const commit = useCallback(
    (next: string | undefined) => {
      setParams(
        prev => {
          const out = new URLSearchParams(prev);
          if (next && next.trim()) out.set(key, next.trim());
          else out.delete(key);
          return out;
        },
        { replace: true }
      );
    },
    [key, setParams]
  );

  return [value, commit];
}

export default ListingSearch;
