import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { TournamentManager } from '@/components/tournament/TournamentManager';

export default function Tournament() {
  return (
    <StandardPageLayout
      title="Tournament Manager"
      description="Organize and track Magic tournaments with bracket generation and standings"
    >
      <TournamentManager />
    </StandardPageLayout>
  );
}
