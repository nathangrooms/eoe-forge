/**
 * /play/online — the lobby.
 *
 * Owner: *"should be able to share or find other players looking for a game in
 * lobby with an open chat/discussion zone like on classic forums - online
 * should work by sending a shareable link to other users - they must be logged
 * in and have 1 deck loaded in."*
 *
 * Two zones, both the full width of the page:
 *
 *   the tables       who is hosting, what they are playing, how many seats are
 *                    left, how long it has been sitting there, and the decks
 *                    already at it drawn as their commanders. Plus the way in a
 *                    friend sent you, pasted whole, and the way to open your own
 *   the discussion   a board. Topics with titles, replies underneath, and none
 *                    of it disappearing, so somebody arriving on Tuesday can
 *                    read what was said on Monday
 *
 * ---------------------------------------------------------------------------
 * A SIGNED-OUT VISITOR GETS THE DISCUSSION
 * ---------------------------------------------------------------------------
 * The board is readable without an account, on purpose, because a forum whose
 * value is that the conversation is already there cannot sit behind a sign-up
 * wall. Posting is not, and the tables are not: `open_game_tables()` refuses a
 * signed-out caller, so that half of the page is replaced by the sentence that
 * explains what an account is for.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE COSTS
 * ---------------------------------------------------------------------------
 * `open_game_tables()` is one grouped query with the seats already aggregated.
 * The board is one indexed select on `forum_topics` with no joins, because the
 * reply count and the last speaker are kept on the topic row by a trigger.
 * Nothing on this page loops and nothing fetches per row. CLAUDE.md records two
 * outages and a disk IO warning from exactly that, one of them 421 requests on
 * a single page visit.
 *
 * Updates are pushed on one shared channel. Nothing polls except the bounded
 * fallback in `channel.ts`, and only while the push channel reports itself down.
 *
 * ---------------------------------------------------------------------------
 * ---------------------------------------------------------------------------
 * THIS IS STEP THREE, NOT A DIFFERENT PRODUCT
 * ---------------------------------------------------------------------------
 * Mode, then deck, then the table. Online is the third step of that flow with
 * other people added to it, so it wears the same step label, the same
 * breadcrumb of choices and the same back control as versus bots, goldfish and
 * playtest, and it takes the deck already chosen on the one shared deck wall.
 * Online does NOT get its own deck picker.
 *
 * It keeps its own URL for two reasons that are about links rather than layout:
 * a table invitation is the owner's stated way in and an invitation needs a
 * real address, and this page is readable signed out, which the flow on `/play`
 * is not.
 *
 * ---------------------------------------------------------------------------
 * JOINING HAPPENS AT THE TABLE, NOT HERE
 * ---------------------------------------------------------------------------
 * Every way in leads to `/play/t/<code>`: the button on a row, a pasted link, a
 * post that names a table, and the link a host sends to a friend. One screen
 * decides whether you may sit down and one screen does the sitting, so a rule
 * added to it cannot be missing from four other doors.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';

import { EntryGate } from '@/components/lobby/EntryGate';
import { FriendsPanel } from '@/components/lobby/FriendsPanel';
import { OpenTables } from '@/components/lobby/OpenTables';
import { JoinByCode } from '@/components/lobby/JoinByCode';
import { DiscussionZone } from '@/components/lobby/DiscussionZone';
import {
  CreateTablePanel,
  type CreateTableValue,
} from '@/components/lobby/CreateTablePanel';
import { useLobbyFeed } from '@/components/lobby/useLobbyFeed';

import { StepBar, StepTitle } from '@/components/play/StepChrome';
import { breadcrumbFor, headingFor } from '@/components/play/playFlow';
import { modeOf } from '@/components/play/playModes';
import { usePlayDecks } from '@/components/play/usePlayDecks';
import { presenceDoing } from '@/components/play/presenceWords';

import {
  createTable,
  entryVerdict,
  keepPresence,
  lobbyErrorMessage,
  preferredName,
  setVisibility,
  tablePath,
} from '@/lib/lobby';

export default function Lobby() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /* The same read the rest of play mode uses, under the same cache key, so
     arriving here from step two re-reads nothing at all. Three batched queries,
     never one per deck: see `usePlayDecks`. */
  const decks = usePlayDecks(user?.id);

  /* The deck chosen at step two, carried in the URL. Absent when somebody
     opened this page from a link rather than from the flow, which is a normal
     way to arrive and not an error. */
  const carriedDeckId = params.get('deck');
  const carriedDeck = useMemo(
    () => (decks.data ?? []).find(deck => deck.id === carriedDeckId) ?? null,
    [decks.data, carriedDeckId]
  );

  const feed = useLobbyFeed(Boolean(user));

  const verdict = entryVerdict({
    signedIn: Boolean(user),
    decks: decks.data ?? [],
  });
  /* An unfinished read is not an answer. Saying "you have no decks" while the
     decks are still being counted is a claim the page cannot support yet, and
     it would appear for a moment on every visit. */
  const verdictKnown = !decks.isLoading;
  /* `in` rather than `verdict.ok`, for the reason written on `EntryGate`: this
     project compiles with `strictNullChecks: false`, and TypeScript does not
     narrow a union on a boolean literal discriminant in that mode. The refusal
     branch is the one carrying a title. */
  const canPlay = !('title' in verdict);

  const myName = preferredName({
    username: (user?.user_metadata as { username?: string } | undefined)?.username,
    email: user?.email,
  });

  /* Which conversation is open lives in the URL, so back and forward work and a
     thread can be sent to somebody. */
  const openTopicId = useMemo(() => {
    const raw = params.get('topic');
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [params]);

  const openTopic = (topicId: number | null) => {
    const next = new URLSearchParams(params);
    if (topicId === null) next.delete('topic');
    else next.set('topic', String(topicId));
    setParams(next);
  };

  /* Which room is open lives in the URL for the same reason a topic does: back
     and forward work, and a room can be sent to somebody. A slug that is not a
     slug is dropped rather than passed to the database. */
  const openRoomSlug = useMemo(() => {
    const raw = (params.get('room') ?? '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(raw) ? raw : null;
  }, [params]);

  const openRoom = (slug: string) => {
    const next = new URLSearchParams(params);
    next.set('room', slug);
    next.delete('topic');
    setParams(next);
  };

  /* A post like "room for one more" should carry the way in, and the table it
     means is the one you are sitting at. */
  const myTable = useMemo(() => feed.tables.find(table => table.seated) ?? null, [feed.tables]);

  /* Saying you are around, one row, every 90 seconds, and only while this tab
     is being looked at. A friend who is in the lobby is the single most useful
     thing a friends list can tell somebody, so the phrase says so. It writes
     nothing when the reader has that switch off. */
  useEffect(() => {
    if (!user) return;
    return keepPresence({
      doing: presenceDoing('lobby', 'online'),
      tableCode: myTable?.code ?? null,
    });
  }, [user, myTable?.code]);

  const openTable = (code: string) => navigate(tablePath(code));

  const onCreate = async (value: CreateTableValue) => {
    const deck = (decks.data ?? []).find(entry => entry.id === value.deckId);
    if (!deck) return;

    setCreating(true);
    setCreateError(null);
    try {
      /* The deck NAME goes up now so the table has an identity the moment it is
         listed. The deck itself is shuffled at the table, by `prepareSeat`,
         because the shuffle has to be committed to against a table id that does
         not exist yet at this point. */
      const table = await createTable(
        {
          displayName: value.displayName,
          deckId: deck.id,
          deckName: deck.name,
        },
        { format: deck.format, maxSeats: value.maxSeats }
      );

      if (value.visibility === 'link') {
        await setVisibility(table.id, 'link');
      }

      setCreateOpen(false);
      navigate(tablePath(table.code));
    } catch (error) {
      setCreateError(lobbyErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const heading = headingFor('table', 'online');
  const backToDeck = () =>
    navigate(
      carriedDeckId
        ? `/play?mode=online&deck=${encodeURIComponent(carriedDeckId)}`
        : '/play?mode=online'
    );

  return (
    <StandardPageLayout
      /* Signed in, this is step three of the play flow and it says so. Signed
         out there is no flow to be three steps into: somebody arriving on a
         shared link has taken no steps, and telling them they are on step three
         of something they have not started is a lie about the screen they are
         looking at. They get the plain title and the board they came for. */
      title={
        user ? <StepTitle label={heading.label} title={heading.title} /> : 'Play online'
      }
      description={
        user
          ? heading.note ?? undefined
          : 'Read what people are saying about games. Sign in to sit down at one.'
      }
      action={
        user ? (
          <Button size="lg" onClick={() => setCreateOpen(true)} disabled={!canPlay}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Open a table
          </Button>
        ) : null
      }
    >
      <div className="w-full space-y-6">
        {/* The same bar the other three modes carry, at the top, so this reads
            as the third step of one flow rather than a different screen. There
            is no forward control: the way on is a table, and a table is a
            destination with its own address. Signed out there is no flow to be
            in, and no deck, so it is not drawn. */}
        {user && (
          <StepBar
            crumbs={breadcrumbFor({
              mode: 'online',
              deckName: carriedDeck?.name ?? null,
              tableLabel: 'Lobby',
            })}
            current="table"
            onJump={step => {
              if (step === 'mode') navigate('/play');
              else backToDeck();
            }}
            backLabel="Change deck"
            onBack={backToDeck}
            note={
              carriedDeck
                ? `Sitting down with ${carriedDeck.name}.`
                : 'Pick a deck at step two and the table opens on it.'
            }
          />
        )}
        {/* The tables. Signed out, this half is replaced by what it is for. */}
        {user ? (
          <>
            {verdictKnown && 'title' in verdict && <EntryGate verdict={verdict} />}

            <div className="grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">Tables waiting</h2>

                  {/* The push channel's real state, said plainly. A lobby that
                      has stopped hearing about changes looks exactly like an
                      empty one, and guessing which is worse than being told. */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {feed.live === 'live'
                        ? 'Updating as it happens'
                        : feed.live === 'connecting'
                          ? 'Connecting'
                          : 'Reconnecting, checking every 25 seconds'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={feed.refreshTables}
                      aria-label="Check for new tables"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <OpenTables
                  tables={feed.tables}
                  loading={feed.loadingTables}
                  canJoin={canPlay}
                  onOpen={table => openTable(table.code)}
                />
              </div>

              <div className="min-w-0">
                <JoinByCode onOpen={openTable} />
              </div>
            </div>
          </>
        ) : (
          <section className="w-full rounded-xl bg-muted/40 p-6">
            <h2 className="text-lg font-semibold text-foreground">
              Sign in to see who is playing
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              You need an account and one deck with cards in it to sit down at a table.
              Reading the discussion below needs neither.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/login?next=%2Fplay%2Fonline">Sign in</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/register">Make an account</Link>
              </Button>
            </div>
          </section>
        )}

        {/* People first, then talking. The friends list is the same component
            and the same one query the strip on `/play` uses, so arriving here
            from step one re-reads nothing and holds one connection either way.

            The table you are sitting at is passed in, so inviting a friend goes
            through the lobby's own tables and their existing share links rather
            than being a second way to start a game. */}
        <FriendsPanel
          userId={user?.id}
          signedIn={Boolean(user)}
          myTableId={myTable?.id ?? null}
          myTableCode={myTable?.code ?? null}
          myTableIsWaiting={Boolean(myTable)}
          onOpenTable={openTable}
        />

        {/* The room people talk in, and the conversations that stay under it.
            Full width, and the same component for everybody who can see this
            page, signed in or not. */}
        <DiscussionZone
          signedIn={Boolean(user)}
          myUserId={user?.id}
          myName={myName}
          isModerator={Boolean(isAdmin)}
          myTableCode={myTable?.code ?? null}
          openTopicId={openTopicId}
          onOpenTopic={openTopic}
          roomSlug={openRoomSlug}
          onOpenRoom={openRoom}
        />

      </div>

      <CreateTablePanel
        open={createOpen}
        onOpenChange={setCreateOpen}
        decks={decks.data ?? []}
        loadingDecks={decks.isLoading}
        creating={creating}
        error={createError}
        defaultName={myName}
        defaultDeckId={carriedDeckId}
        onCreate={value => void onCreate(value)}
      />
    </StandardPageLayout>
  );
}
