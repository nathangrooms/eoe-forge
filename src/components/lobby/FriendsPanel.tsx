import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FindPlayers } from './FindPlayers';
import { FriendRow } from './FriendRow';
import { FriendSheet } from './FriendSheet';
import { SharingPanel } from './SharingPanel';
import { useFriends, useSharing } from './useFriends';
import {
  FRIENDS_BLURB,
  answerFriendRequest,
  declineTableInvite,
  emptyFriendsLine,
  groupFriends,
  lobbyErrorMessage,
  sharingSummary,
  type Friend,
} from '@/lib/lobby';

/**
 * The friends list, in the play section, where the owner went looking for it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AT THE TOP, AND WHY
 * ---------------------------------------------------------------------------
 * People waiting on YOUR answer come first, then friends who are around, then
 * everybody else, then people you asked who have not answered. That is the
 * order somebody actually cares about, and it comes out of `my_friends()`
 * already sorted: `groupFriends` splits one list rather than sorting it again,
 * so the panel and the database cannot come to disagree about what is at the
 * top of the page.
 *
 * ---------------------------------------------------------------------------
 * ONE QUERY AND ONE SUBSCRIPTION
 * ---------------------------------------------------------------------------
 * `useFriends` is one call to `my_friends()` and one channel on your own
 * account's topic, both shared with anything else on the page that wants the
 * same list. Everything drawn here comes out of that one read: whether somebody
 * is around, what they play, the commander of their last deck, and whether they
 * have a table invitation waiting for you. There is no lookup per friend.
 *
 * ---------------------------------------------------------------------------
 * WHAT A FRIEND CAN SEE IS ON THIS SCREEN, NOT IN SETTINGS
 * ---------------------------------------------------------------------------
 * The sentence at the top says what your friends can currently see about you,
 * and pressing it opens the switches. Sharing decided three pages away in a
 * settings tree is sharing nobody knows they agreed to, and the collection is
 * the one that matters: it starts off, and it says so where somebody can act
 * on it.
 */

export interface FriendsPanelProps {
  userId: string | null | undefined;
  signedIn: boolean;
  /** The table you are sitting at, so a friend can be asked to it. */
  myTableId?: string | null;
  myTableCode?: string | null;
  myTableIsWaiting?: boolean;
  onOpenTable: (code: string) => void;
}

export function FriendsPanel({
  userId,
  signedIn,
  myTableId,
  myTableCode,
  myTableIsWaiting,
  onOpenTable,
}: FriendsPanelProps) {
  const feed = useFriends(userId);
  const sharing = useSharing(userId);

  const [finding, setFinding] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [open, setOpen] = useState<Friend | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = groupFriends(feed.friends);
  const invitations = feed.friends.filter(friend => friend.inviteId !== null);

  const answer = async (friend: Friend, accept: boolean) => {
    setBusy(friend.userId);
    setError(null);
    try {
      await answerFriendRequest(friend.userId, accept);
      feed.refresh();
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const refuseInvite = async (friend: Friend) => {
    if (friend.inviteId === null) return;
    setBusy(friend.userId);
    setError(null);
    try {
      await declineTableInvite(friend.inviteId);
      feed.refresh();
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (!signedIn) {
    return (
      <section className="w-full rounded-xl bg-muted/30 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Friends</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {emptyFriendsLine(false)} {FRIENDS_BLURB}
        </p>
        {/* A heading and a paragraph and nothing to press. Every other card on
            this page ends in a control; this one told a signed-out visitor what
            they were missing and then left them to work out how to get it. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/register?next=%2Fplay%2Fonline">Make an account</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/login?next=%2Fplay%2Fonline">Sign in</Link>
          </Button>
        </div>
      </section>
    );
  }

  const nobody = feed.friends.length === 0 && !feed.loading;

  return (
    <section className="w-full rounded-xl bg-muted/30 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Friends</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{FRIENDS_BLURB}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {feed.live === 'live'
              ? 'Updating as it happens'
              : feed.live === 'connecting'
                ? 'Connecting'
                : 'Reconnecting'}
          </span>
          <Button variant="secondary" onClick={() => setChoosing(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            What friends can see
          </Button>
          <Button onClick={() => setFinding(true)}>
            <Search className="mr-2 h-4 w-4" aria-hidden="true" />
            Find somebody
          </Button>
        </div>
      </header>

      {/* The one sentence that says where you stand, at the point somebody is
          about to add a person who will be covered by it. */}
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="mt-3 text-left text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {sharingSummary(sharing.sharing)}
      </button>

      {error && <p className="mt-3 text-sm text-foreground">{error}</p>}

      {feed.loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Reading your friends
        </p>
      )}

      {nobody && <p className="mt-4 text-sm text-muted-foreground">{emptyFriendsLine(true)}</p>}

      {groups.waiting.length > 0 && (
        <Group
          title={
            groups.waiting.length === 1
              ? '1 person wants to be friends'
              : `${groups.waiting.length} people want to be friends`
          }
        >
          {groups.waiting.map(friend => (
            <FriendRow
              key={friend.userId}
              friend={friend}
              busy={busy === friend.userId}
              onAccept={row => void answer(row, true)}
              onRefuse={row => void answer(row, false)}
            />
          ))}
        </Group>
      )}

      {invitations.length > 0 && (
        <Group title="Invitations to a table">
          {invitations.map(friend => (
            <FriendRow
              key={`invite-${friend.userId}`}
              friend={friend}
              busy={busy === friend.userId}
              onJoinTable={onOpenTable}
              onDeclineInvite={row => void refuseInvite(row)}
              onOpen={setOpen}
            />
          ))}
        </Group>
      )}

      {groups.around.length > 0 && (
        <Group title="Around now">
          {groups.around.map(friend => (
            <FriendRow key={friend.userId} friend={friend} onOpen={setOpen} onJoinTable={onOpenTable} />
          ))}
        </Group>
      )}

      {groups.away.length > 0 && (
        <Group title={groups.around.length > 0 ? 'Not around' : 'Your friends'}>
          {groups.away.map(friend => (
            <FriendRow key={friend.userId} friend={friend} onOpen={setOpen} onJoinTable={onOpenTable} />
          ))}
        </Group>
      )}

      {groups.asked.length > 0 && (
        <Group title="Waiting on an answer">
          {groups.asked.map(friend => (
            <FriendRow key={friend.userId} friend={friend} />
          ))}
        </Group>
      )}

      <FindPlayers open={finding} onOpenChange={setFinding} onChanged={feed.refresh} />

      <SharingPanel
        open={choosing}
        onOpenChange={setChoosing}
        sharing={sharing.sharing}
        saving={sharing.saving}
        error={sharing.error}
        onChange={next => void sharing.set(next)}
        onChanged={feed.refresh}
      />

      <FriendSheet
        friend={open}
        onOpenChange={next => {
          if (!next) setOpen(null);
        }}
        myTableId={myTableId}
        myTableCode={myTableCode}
        myTableIsWaiting={myTableIsWaiting}
        onChanged={feed.refresh}
        onJoinTable={onOpenTable}
      />
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}
