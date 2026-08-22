import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { CardGrid, CardImage } from '@/components/cards';
import {
  aroundLine,
  blockPlayer,
  collectionHiddenLine,
  collectionLine,
  friendCollection,
  friendDecks,
  inviteFriendToTable,
  lobbyErrorMessage,
  removeFriend,
  safeName,
  whyNotInvite,
  type Friend,
  type FriendCollection,
  type FriendDeck,
} from '@/lib/lobby';

/**
 * One friend, whole: what they play, what they own, and the way to ask them over.
 *
 * A right-hand slide-over, so the friends list stays on screen behind it and
 * keeps its place. Never a centred dialog.
 *
 * ---------------------------------------------------------------------------
 * THE CARDS ARE THE POINT, SO THEY ARE LARGE
 * ---------------------------------------------------------------------------
 * A friend's decks are drawn as their commanders at full size through the
 * canonical `CardImage`, uncropped and unaltered, in the shared `CardGrid`. A
 * list of deck names in grey would answer the question "how many decks does
 * Dave have", which nobody asks. "What does Dave play" is answered by the card.
 *
 * ---------------------------------------------------------------------------
 * TWO TABS, TWO READS, AND NEITHER HAPPENS UNTIL IT IS LOOKED AT
 * ---------------------------------------------------------------------------
 * Decks read when the panel opens. The collection reads when the collection tab
 * is opened and not before, because most people keep it private and reading it
 * on open would be a refused query per friend per glance.
 *
 * Each is ONE call. `friend_decks` brings the commander and the card count with
 * it, `friend_collection` brings the totals and the most valuable cards in one
 * object. There is no per-deck or per-card lookup anywhere in this file.
 *
 * ---------------------------------------------------------------------------
 * AN EMPTY ANSWER IS THE DATABASE REFUSING
 * ---------------------------------------------------------------------------
 * `friend_decks` returns nothing and `friend_collection` returns null when the
 * switch is off, and this screen says which of the two it is looking at rather
 * than drawing an empty shelf. "Dave keeps their collection private" and "Dave
 * owns nothing" are different sentences about a person.
 */

type Tab = 'decks' | 'collection';

export interface FriendSheetProps {
  friend: Friend | null;
  onOpenChange: (open: boolean) => void;
  /** The table you are sitting at, so a friend can be asked to it. */
  myTableId?: string | null;
  myTableCode?: string | null;
  myTableIsWaiting?: boolean;
  /** Something changed, so the list behind this should be re-read. */
  onChanged: () => void;
  onJoinTable?: (code: string) => void;
}

export function FriendSheet({
  friend,
  onOpenChange,
  myTableId,
  myTableCode,
  myTableIsWaiting,
  onChanged,
  onJoinTable,
}: FriendSheetProps) {
  const [tab, setTab] = useState<Tab>('decks');
  const [decks, setDecks] = useState<FriendDeck[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [collection, setCollection] = useState<FriendCollection | null>(null);
  const [loadedCollection, setLoadedCollection] = useState(false);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const userId = friend?.userId ?? null;

  /* A fresh panel per person. Without this, opening a second friend shows the
     first one's decks under the second one's name until the read lands. */
  useEffect(() => {
    setTab('decks');
    setDecks([]);
    setCollection(null);
    setLoadedCollection(false);
    setNote(null);
    setError(null);
    setConfirmBlock(false);
    setConfirmRemove(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoadingDecks(true);
    friendDecks(userId)
      .then(found => {
        if (alive) setDecks(found);
      })
      .catch(caught => {
        if (alive) setError(lobbyErrorMessage(caught));
      })
      .finally(() => {
        if (alive) setLoadingDecks(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const openCollection = useCallback(() => {
    setTab('collection');
    if (!userId || loadedCollection || loadingCollection) return;
    setLoadingCollection(true);
    friendCollection(userId)
      .then(found => {
        setCollection(found);
        setLoadedCollection(true);
      })
      .catch(caught => setError(lobbyErrorMessage(caught)))
      .finally(() => setLoadingCollection(false));
  }, [userId, loadedCollection, loadingCollection]);

  if (!friend) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetTitle className="sr-only">Friend</SheetTitle>
        </SheetContent>
      </Sheet>
    );
  }

  const name = safeName(friend.name);
  const whyNot = whyNotInvite({
    state: friend.state,
    myTableCode,
    tableIsWaiting: myTableIsWaiting,
  });

  const invite = async () => {
    if (!myTableId) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const sent = await inviteFriendToTable(friend.userId, myTableId);
      setNote(`Asked ${name} to join table ${sent.code}.`);
      onChanged();
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const drop = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeFriend(friend.userId);
      onChanged();
      onOpenChange(false);
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    setBusy(true);
    setError(null);
    try {
      await blockPlayer(friend.userId);
      onChanged();
      onOpenChange(false);
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetTitle className="sr-only">{name}</SheetTitle>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{name}</h2>
            <p className="text-sm text-muted-foreground">{aroundLine(friend)}</p>
          </div>

          {/* Asking them over. The table is one of the lobby's own, and the way
              in is its existing code and link, so this is a shortcut to the
              thing that already worked rather than a second way to start a
              game. Shown and disabled rather than hidden, with the reason on
              it, because a control that vanishes leaves the reader wondering
              whether the feature exists. */}
          <div className="rounded-xl bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={Boolean(whyNot) || busy} onClick={() => void invite()}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {myTableCode ? `Invite to table ${myTableCode}` : 'Invite to a table'}
              </Button>

              {friend.tableCode && (
                <Button variant="secondary" onClick={() => onJoinTable?.(friend.tableCode as string)}>
                  Join their table
                </Button>
              )}
            </div>
            {whyNot && <p className="mt-2 text-xs text-muted-foreground">{whyNot}</p>}
            {note && <p className="mt-2 text-sm text-foreground">{note}</p>}
          </div>

          <div className="flex gap-2">
            <TabChip active={tab === 'decks'} onClick={() => setTab('decks')}>
              Decks
            </TabChip>
            <TabChip active={tab === 'collection'} onClick={openCollection}>
              Collection
            </TabChip>
          </div>

          {tab === 'decks' && (
            <section>
              {loadingDecks && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Reading their decks
                </p>
              )}

              {!loadingDecks && decks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {friend.sharesDecks
                    ? `${name} has not built a deck yet.`
                    : `${name} keeps their decks private.`}
                </p>
              )}

              {decks.length > 0 && (
                <CardGrid width={180}>
                  {decks.map(deck => (
                    <figure key={deck.deckId} className="min-w-0">
                      <CardImage
                        card={{
                          id: deck.deckId,
                          name: deck.commanderName ?? deck.name,
                          image_url: deck.commanderImage ?? undefined,
                        }}
                        fill
                        title={deck.commanderName ?? deck.name}
                      />
                      <figcaption className="mt-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {deck.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {deck.cardCount} cards
                          {deck.commanderName ? `, ${deck.commanderName}` : ''}
                        </p>
                      </figcaption>
                    </figure>
                  ))}
                </CardGrid>
              )}
            </section>
          )}

          {tab === 'collection' && (
            <section>
              {loadingCollection && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Reading their collection
                </p>
              )}

              {!loadingCollection && loadedCollection && collection === null && (
                <p className="text-sm text-muted-foreground">{collectionHiddenLine(name)}</p>
              )}

              {collection && (
                <>
                  <p className="text-sm text-foreground">{collectionLine(collection)}</p>
                  {collection.top.length > 0 && (
                    <>
                      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Most valuable
                      </p>
                      <CardGrid width={150} className="mt-2">
                        {collection.top.map(card => (
                          <figure key={card.cardId} className="min-w-0">
                            <CardImage
                              card={{
                                id: card.cardId,
                                name: card.name,
                                image_url: card.image ?? undefined,
                              }}
                              fill
                              title={card.name}
                            />
                            <figcaption className="mt-1.5">
                              <p className="truncate text-xs text-foreground">{card.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {card.quantity > 1 ? `${card.quantity} copies, ` : ''}
                                ${card.usd.toFixed(2)} each
                              </p>
                            </figcaption>
                          </figure>
                        ))}
                      </CardGrid>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {error && <p className="text-sm text-foreground">{error}</p>}

          {/* Refusing somebody, confirmed in place rather than in a dialog: the
              control swaps to a question and back. */}
          <div className="flex flex-wrap gap-2 pt-2">
            {confirmRemove ? (
              <>
                <span className="self-center text-sm text-foreground">
                  Stop being friends with {name}?
                </span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void drop()}>
                  Yes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Keep them
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmRemove(true);
                  setConfirmBlock(false);
                }}
              >
                Stop being friends
              </Button>
            )}

            {confirmBlock ? (
              <>
                <span className="self-center text-sm text-foreground">
                  Block {name}? They will not be told.
                </span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void block()}>
                  Block them
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmBlock(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmBlock(true);
                  setConfirmRemove(false);
                }}
              >
                Block
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-foreground font-medium text-background'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
