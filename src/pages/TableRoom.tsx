/**
 * /play/t/:code — one table, and the seats at it.
 *
 * This is where a shared link lands. Owner: *"online should work by sending a
 * shareable link to other users - they must be logged in and have 1 deck loaded
 * in."* So this page has to hold four different people at four different
 * moments and be right for all of them:
 *
 *   a stranger, signed out    told what they are looking at and how to get in,
 *                             with the code still in the URL so signing in does
 *                             not throw the invitation away
 *   a player with no deck     told exactly that, with the button that fixes it
 *   somebody about to join    shown who is already here and what they brought
 *   somebody already seated   the room itself: chairs, decks, ready, start
 *
 * ---------------------------------------------------------------------------
 * ONE JOIN, NOT FOUR
 * ---------------------------------------------------------------------------
 * Every route into an online game arrives here: the lobby list, a pasted link,
 * a chat message naming a table, and the link a host sends. None of them join a
 * table themselves. The entry rule, the deck choice and the seat all live on
 * this page, once, so a rule added to it cannot be missing from three other
 * doors. `join_online_table` is also the rejoin path, because from the
 * database's side a reconnect and a deck change are the same statement.
 *
 * ---------------------------------------------------------------------------
 * THE READS
 * ---------------------------------------------------------------------------
 * `peek_online_table(code)` answers for somebody not seated yet: the host, the
 * format, how full it is. `online_table_room(id)` answers for somebody who is,
 * and returns the whole room as ONE row including every seat. Neither is
 * followed by a lookup per chair.
 *
 * Seat changes are pushed from `nudge_the_room`, a trigger on the seat row, on
 * the table's own Realtime topic. Nothing here polls.
 *
 * ---------------------------------------------------------------------------
 * THE TALK BESIDE THE SEATS
 * ---------------------------------------------------------------------------
 * `TableTalk` is the SAME conversation surface as the board on the lobby page,
 * scoped to this table. Not a second chat: the same read, the same component,
 * the same renderer that makes a stranger's words safe. Only who may read it
 * differs, and that is a policy in the database rather than anything on screen.
 *
 * It shares this table's one Realtime channel with the seats, reference counted
 * in `channel.ts`, so a page watching for both holds one connection.
 *
 * It appears once you are sitting down, because reading it and subscribing to
 * it are both membership checks. Asking before there is a seat is a refusal,
 * not an empty answer.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Users } from 'lucide-react';

import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';

import { cn } from '@/lib/utils';
import { EntryGate } from '@/components/lobby/EntryGate';
import { TableTalk } from '@/components/lobby/TableTalk';
import { ShareLink } from '@/components/lobby/ShareLink';
import { TableSeats } from '@/components/lobby/TableSeats';
import { DeckChoice, playableDecks } from '@/components/lobby/DeckChoice';
import {
  HostControls,
  LeaveTable,
  SeatControls,
} from '@/components/lobby/SeatControls';
import { useTableRoom } from '@/components/lobby/useTableRoom';
/* One sentence about what is not finished, kept in one place. The mode wall,
   the lobby and this page all read it from here, so they cannot drift. */
import { modeOf } from '@/components/play/playModes';

import {
  entryVerdict,
  joinTable,
  leaveTable,
  lobbyErrorMessage,
  newPublicSeed,
  normaliseCode,
  peekTable,
  prepareSeat,
  preferredName,
  setSeat,
  setVisibility,
  startTable,
  tableLink,
  tablePath,
  whyNotStartable,
} from '@/lib/lobby';
import { listPlayableDecks, type DeckSummary } from '@/lib/play/deckSource';

export default function TableRoom() {
  const params = useParams<{ code: string }>();
  const code = normaliseCode(params.code ?? '');
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [shuffling, setShuffling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [starting, setStarting] = useState(false);
  const [changingVisibility, setChangingVisibility] = useState(false);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [chosenDeckId, setChosenDeckId] = useState<string | null>(null);

  const decks = useQuery({
    queryKey: ['playable-decks', user?.id],
    queryFn: () => listPlayableDecks(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  /* Who is at this table, before you are. Refetched after a join because the
     seat count in it is what a stranger is deciding on. */
  const peek = useQuery({
    queryKey: ['table-peek', code],
    queryFn: () => peekTable(code),
    enabled: Boolean(user) && code.length > 0,
    staleTime: 10_000,
  });

  const tableId = peek.data?.id ?? null;
  const { room, loading: roomLoading, refresh } = useTableRoom(tableId);

  const mySeat = useMemo(
    () => room?.seats.find(seat => seat.userId === user?.id) ?? null,
    [room, user?.id]
  );

  const verdict = entryVerdict({ signedIn: Boolean(user), decks: decks.data ?? [] });
  /* `in` rather than `verdict.ok`: this project compiles with
     `strictNullChecks: false` and does not narrow on a boolean discriminant.
     See the note on `EntryGate`. */
  const canPlay = !('title' in verdict);
  /* Saying "you have no decks" while they are still being counted is a claim
     the page cannot support yet, and it would flash on every visit. */
  const verdictKnown = !decks.isLoading;

  const myName = preferredName({
    username: (user?.user_metadata as { username?: string } | undefined)?.username,
    email: user?.email,
  });

  const playable = playableDecks(decks.data ?? []);
  const deckForJoin = chosenDeckId ?? playable[0]?.id ?? null;

  /* -------------------------------------------------------------------- */
  /* Putting a deck down                                                  */
  /* -------------------------------------------------------------------- */

  /** The seat and deck already shuffled for, so arriving does it once. */
  const shuffledFor = useRef<string | null>(null);

  /**
   * Load the chosen deck, shuffle it here, and publish what a seat publishes.
   *
   * The private half — the shuffle seed and the deck itself — goes to
   * `game_seat_secrets`, whose RLS is `user_id = auth.uid()` on every command.
   * The public half is the deck name, the library size, the commanders face up
   * and the fingerprint of the shuffle. Nobody else's machine ever holds your
   * cards, because there is no dealer that knows more than one deck.
   */
  const putDeckDown = async (deckId: string, seatPlayerId: string, seatName: string) => {
    if (!tableId) return;
    const deck = (decks.data ?? []).find(entry => entry.id === deckId);
    if (!deck) {
      setSeatError('That deck is not on your account any more. Pick another one.');
      return;
    }

    setShuffling(true);
    setSeatError(null);
    try {
      const prepared = await prepareSeat({
        tableId,
        playerId: seatPlayerId,
        displayName: seatName,
        deck,
      });
      // Changing your deck un-readies you. Readying up meant "with that deck",
      // and the host would otherwise start on an agreement nobody made.
      await setSeat(tableId, { ...prepared, ready: false });
      refresh();
    } catch (error) {
      setSeatError(lobbyErrorMessage(error));
      /* Let it be tried again with the SAME deck. A select does not fire when
         you re-pick the value it already holds, so without clearing this the
         only way out of a failed shuffle would be to choose a different deck. */
      shuffledFor.current = null;
    } finally {
      setShuffling(false);
    }
  };

  /*
   * Somebody who chose a deck on the way in has already made this choice.
   *
   * `create_online_table` and `join_online_table` record the deck id but cannot
   * record the shuffle, because the commitment is scoped to a table id that did
   * not exist when the deck was picked. So the shuffle happens on arrival, once
   * per seat and deck, and the player sees it happen rather than being asked
   * the same question twice.
   */
  useEffect(() => {
    if (!tableId || !mySeat || !mySeat.deckId || mySeat.committed) return;
    if (decks.isLoading || shuffling) return;

    const key = `${tableId}:${mySeat.deckId}`;
    if (shuffledFor.current === key) return;
    shuffledFor.current = key;

    void putDeckDown(mySeat.deckId, mySeat.playerId, mySeat.name);
    // putDeckDown is recreated every render and is deliberately not a dependency;
    // the guard above is what makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, mySeat?.deckId, mySeat?.committed, decks.isLoading]);

  /* -------------------------------------------------------------------- */
  /* The rest of the actions                                              */
  /* -------------------------------------------------------------------- */

  const onJoin = async () => {
    if (!deckForJoin) return;
    const deck = playable.find(entry => entry.id === deckForJoin);
    if (!deck) return;

    setJoining(true);
    setSeatError(null);
    try {
      await joinTable(code, {
        displayName: myName,
        deckId: deck.id,
        deckName: deck.name,
      });
      await peek.refetch();
      refresh();
    } catch (error) {
      setSeatError(lobbyErrorMessage(error));
    } finally {
      setJoining(false);
    }
  };

  const onReady = async (ready: boolean) => {
    if (!tableId) return;
    setSaving(true);
    setSeatError(null);
    try {
      await setSeat(tableId, { ready });
      refresh();
    } catch (error) {
      setSeatError(lobbyErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const onLeave = async () => {
    if (!tableId) return;
    setLeaving(true);
    try {
      await leaveTable(tableId);
      navigate('/play/online');
    } catch (error) {
      setSeatError(lobbyErrorMessage(error));
      setLeaving(false);
    }
  };

  const onStart = async () => {
    if (!tableId) return;
    setStarting(true);
    setSeatError(null);
    try {
      await startTable(tableId, newPublicSeed());
      refresh();
    } catch (error) {
      setSeatError(lobbyErrorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  const onVisibility = async (visibility: 'public' | 'link') => {
    if (!tableId) return;
    setChangingVisibility(true);
    try {
      await setVisibility(tableId, visibility);
      refresh();
    } catch (error) {
      setSeatError(lobbyErrorMessage(error));
    } finally {
      setChangingVisibility(false);
    }
  };

  /* -------------------------------------------------------------------- */
  /* What is on screen                                                    */
  /* -------------------------------------------------------------------- */

  const link = tableLink(code, globalThis.location?.origin ?? '');

  /* Signed out. The URL keeps the code, so signing in comes straight back. */
  if (!user) {
    return (
      <StandardPageLayout title={`Table ${code}`} description="Somebody invited you to a game.">
        <section className="w-full rounded-xl bg-muted/40 p-6">
          <h2 className="text-lg font-semibold text-foreground">Sign in to take your seat</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Online tables are tied to your account, so the other players know who they are
            sitting with. You also need one deck with cards in it.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <Link to={`/login?next=${encodeURIComponent(tablePath(code))}`}>Sign in</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/register">Make an account</Link>
            </Button>
          </div>
        </section>
      </StandardPageLayout>
    );
  }

  if (peek.isLoading) {
    return (
      <StandardPageLayout title={`Table ${code}`}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Finding the table
        </p>
      </StandardPageLayout>
    );
  }

  if (!peek.data) {
    return (
      <StandardPageLayout title={`Table ${code}`}>
        <section className="w-full rounded-xl bg-muted/40 p-6">
          <h2 className="text-lg font-semibold text-foreground">No table with that code</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            It may have been packed away. Tables close when the last person leaves, and after
            30 minutes of nothing happening.
          </p>
          <Button asChild className="mt-4">
            <Link to="/play/online">See who else is playing</Link>
          </Button>
        </section>
      </StandardPageLayout>
    );
  }

  const table = peek.data;
  const isHost = Boolean(room && user && room.hostUser === user.id);
  const status = room?.status ?? table.status;

  return (
    <StandardPageLayout
      title={room?.format ?? table.format}
      description={`Table ${code}. Hosted by ${table.hostName ?? 'a player'}.`}
      action={
        mySeat ? (
          <LeaveTable
            lastOneHere={(room?.seats.length ?? 0) <= 1}
            leaving={leaving}
            confirming={confirmLeave}
            onAsk={() => setConfirmLeave(true)}
            onCancel={() => setConfirmLeave(false)}
            onConfirm={() => void onLeave()}
          />
        ) : null
      }
    >
      <div
        className={cn(
          'grid w-full gap-4',
          tableId && 'xl:grid-cols-[minmax(0,1fr)_22rem]'
        )}
      >
        <div className="min-w-0 space-y-4">
        {status !== 'lobby' && <GameUnderWay status={status} />}

        {/* What is not finished, said BEFORE the Start button rather than on the
            screen you land on after pressing it.

            A table link is sent to people who have never seen /play or the
            lobby, and this page is where Start actually is, so the lobby
            carrying the sentence was not enough: an invited player could sit
            down, ready up and start a game without once being told that the
            game itself is not built. Same sentence, same source as the mode
            wall and the lobby, so the three cannot drift apart. */}
        {status === 'lobby' && (
          <p className="w-full rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Still being built. </span>
            {modeOf('online').developing}
          </p>
        )}

        {/* The chairs. Always the same component, whether you are in one or not. */}
        {room ? (
          <TableSeats room={room} meUserId={user?.id} />
        ) : (
          <section className="w-full rounded-xl bg-muted/30 p-6">
            <p className="flex items-center gap-2 text-base text-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
              {table.seatsTaken} of {table.maxSeats} seats taken
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You can see who brought what once you sit down.
            </p>
          </section>
        )}

        {/* Sitting down, or the seat you already have. */}
        {mySeat ? (
          status === 'lobby' && (
            <SeatControls
              seat={mySeat}
              decks={decks.data ?? []}
              loadingDecks={decks.isLoading}
              shuffling={shuffling}
              saving={saving}
              error={seatError}
              onChooseDeck={deckId => void putDeckDown(deckId, mySeat.playerId, mySeat.name)}
              onReady={ready => void onReady(ready)}
              onRetry={() => {
                if (mySeat.deckId) {
                  void putDeckDown(mySeat.deckId, mySeat.playerId, mySeat.name);
                }
              }}
            />
          )
        ) : (
          <JoinPanel
            full={table.seatsTaken >= table.maxSeats}
            started={status !== 'lobby'}
            canPlay={canPlay}
            verdictNode={
              verdictKnown && 'title' in verdict ? <EntryGate verdict={verdict} /> : null
            }
            decks={decks.data ?? []}
            loadingDecks={decks.isLoading}
            deckId={deckForJoin}
            joining={joining}
            error={seatError}
            onChooseDeck={setChosenDeckId}
            onJoin={() => void onJoin()}
          />
        )}

        {/* The host's half. */}
        {isHost && room && status === 'lobby' && (
          <HostControls
            room={room}
            startReason={whyNotStartable(room)}
            starting={starting}
            changingVisibility={changingVisibility}
            onStart={() => void onStart()}
            onVisibility={visibility => void onVisibility(visibility)}
          />
        )}

        {/* The link is the point, and it belongs to everybody at the table. */}
        {mySeat && status === 'lobby' && <ShareLink code={code} link={link} />}

        {roomLoading && !room && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading the table
          </p>
        )}
        </div>

        {/* Shown to anybody looking at the table, not only to somebody in a
            chair. Sitting down is what turns it on, and the panel says so
            itself, which is more use than an empty space where a thing will
            appear later. */}
        {tableId && (
          <div
            className={cn(
              'min-w-0',
              mySeat && 'xl:sticky xl:top-4 xl:h-[calc(100vh-11rem)]',
              !mySeat && 'self-start'
            )}
          >
            <TableTalk
              tableId={tableId}
              seated={Boolean(mySeat)}
              signedIn={Boolean(user)}
              myUserId={user?.id}
              myName={mySeat?.name ?? myName}
              isModerator={Boolean(isAdmin)}
            />
          </div>
        )}
      </div>
    </StandardPageLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Sitting down                                                               */
/* -------------------------------------------------------------------------- */

function JoinPanel({
  full,
  started,
  canPlay,
  verdictNode,
  decks,
  loadingDecks,
  deckId,
  joining,
  error,
  onChooseDeck,
  onJoin,
}: {
  full: boolean;
  started: boolean;
  canPlay: boolean;
  verdictNode: ReactNode;
  decks: DeckSummary[];
  loadingDecks: boolean;
  deckId: string | null;
  joining: boolean;
  error?: string | null;
  onChooseDeck: (deckId: string) => void;
  onJoin: () => void;
}) {
  if (started) return null;

  if (verdictNode) return <>{verdictNode}</>;

  if (full) {
    return (
      <section className="w-full rounded-xl bg-muted/40 p-6">
        <h2 className="text-lg font-semibold text-foreground">Every seat is taken</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Somebody may still stand up. Leave this open, or go and find another game.
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/play/online">Back to the lobby</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="w-full rounded-xl bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Take a seat</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick what you are playing. It gets shuffled on your machine and nobody else ever sees
        it.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm">
          <label
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor="join-deck"
          >
            Your deck
          </label>
          <DeckChoice
            id="join-deck"
            decks={decks}
            loading={loadingDecks}
            value={deckId}
            disabled={joining}
            onChange={onChooseDeck}
          />
        </div>

        <Button size="lg" disabled={!canPlay || joining || !deckId} onClick={onJoin}>
          {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Sit down
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-foreground">{error}</p>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* After the host presses start                                               */
/* -------------------------------------------------------------------------- */

/**
 * The lobby's job ends here.
 *
 * The shared table surface for an online seat is not built yet, and this says
 * so rather than sending somebody to a screen that will not play their game.
 * Play mode already states an unbuilt thing plainly on its mode wall, and the
 * alternative — a button that goes somewhere wrong — is the thing this project
 * keeps having to undo.
 *
 * Nothing is lost while it waits. The seats, the shuffle commitments and the
 * action log are all in the database, and `join_online_table` is the rejoin
 * path for a table already running.
 */
function GameUnderWay({ status }: { status: string }) {
  if (status === 'playing') {
    return (
      <section className="w-full rounded-xl bg-muted/40 p-6">
        <h2 className="text-lg font-semibold text-foreground">The game has started</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The shared table you play it on is the next piece of this. Your seat and every move
          made at this table are saved, so nothing is lost while it is being built.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full rounded-xl bg-muted/40 p-6">
      <h2 className="text-lg font-semibold text-foreground">This game is over</h2>
      <p className="mt-1 text-sm text-muted-foreground">Open a new table when you are ready.</p>
      <Button asChild className="mt-4">
        <Link to="/play/online">Back to the lobby</Link>
      </Button>
    </section>
  );
}
