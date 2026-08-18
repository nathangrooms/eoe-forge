import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import {
  GAME_FORMATS,
  recommendedSwissRounds,
  type GameFormat,
  type Structure,
  type Tournament,
} from '@/components/tournament/scoring';
import { loadTournaments, makeTimer, saveTournaments } from '@/components/tournament/storage';

/**
 * /tournament/new — event setup as a page.
 *
 * It is a five-field form with a free-text player list; as a dialog it needed
 * 90vh and its own scrollbar, which is the shape telling you it wanted a route.
 */
export default function TournamentNew() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [structure, setStructure] = useState<Structure>('swiss');
  const [gameFormat, setGameFormat] = useState<GameFormat>('Commander');
  const [roundLengthMinutes, setRoundLengthMinutes] = useState(50);
  const [players, setPlayers] = useState('');

  const playerCount = players.split('\n').filter(p => p.trim()).length;

  const handleCreate = () => {
    if (!name.trim()) {
      showError('Name required', 'Please enter a tournament name');
      return;
    }

    const playerList = Array.from(
      new Set(
        players
          .split('\n')
          .map(p => p.trim())
          .filter(p => p.length > 0)
      )
    );

    if (playerList.length < 2) {
      showError('Not enough players', 'Need at least 2 uniquely named players');
      return;
    }

    const tournament: Tournament = {
      id: Date.now().toString(),
      name: name.trim(),
      format: structure,
      gameFormat,
      status: 'setup',
      players: playerList,
      dropped: [],
      rounds: [],
      currentRound: 0,
      roundLengthMinutes,
      timer: makeTimer(roundLengthMinutes),
      createdAt: new Date().toISOString(),
    };

    if (!saveTournaments([tournament, ...loadTournaments()])) {
      showError('Failed to save', 'Could not save tournament data');
      return;
    }

    showSuccess('Tournament created', tournament.name);
    // replace: Back from the manager returns to wherever you came from, not to
    // a form you have already submitted.
    navigate(`/tournament?event=${tournament.id}`, { replace: true });
  };

  return (
    <StandardPageLayout
      title="New tournament"
      description="Events are stored in this browser only"
      action={
        <Button variant="ghost" onClick={() => navigate('/tournament')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Tournaments
        </Button>
      }
    >
      <div className="max-w-xl space-y-4 rounded-lg bg-card p-4 shadow-sm md:p-6">
        <div className="space-y-2">
          <Label htmlFor="t-name">Tournament name</Label>
          <Input
            id="t-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Friday Night Magic"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-gameformat">Magic format</Label>
          <Select value={gameFormat} onValueChange={(value: GameFormat) => setGameFormat(value)}>
            <SelectTrigger id="t-gameformat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAME_FORMATS.map(f => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-structure">Pairing structure</Label>
          <Select value={structure} onValueChange={(value: Structure) => setStructure(value)}>
            <SelectTrigger id="t-structure">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="swiss">Swiss</SelectItem>
              <SelectItem value="single-elimination">Single elimination</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {structure === 'swiss'
              ? 'Everyone plays every round, paired on record. Rematches are avoided.'
              : 'Win or go home. Draws are not available in a bracket.'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-round-length">Round length (minutes)</Label>
          <Input
            id="t-round-length"
            type="number"
            min={5}
            max={180}
            value={roundLengthMinutes}
            onChange={e => setRoundLengthMinutes(Math.max(5, Number(e.target.value) || 50))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-players">Players (one per line)</Label>
          <Textarea
            id="t-players"
            className="min-h-[180px] resize-none"
            value={players}
            onChange={e => setPlayers(e.target.value)}
            placeholder={'Alice\nBob\nCharlie\nDiana'}
          />
          <p className="text-xs text-muted-foreground">
            {playerCount} players entered ·{' '}
            {recommendedSwissRounds(Math.max(2, playerCount))} Swiss rounds recommended
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleCreate}>Create tournament</Button>
          <Button variant="ghost" onClick={() => navigate('/tournament')}>
            Cancel
          </Button>
        </div>
      </div>
    </StandardPageLayout>
  );
}
