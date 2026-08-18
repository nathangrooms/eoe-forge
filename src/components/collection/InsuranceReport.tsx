import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FileText, Download, Printer } from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { conditionLabel, formatPrice, normalizeCondition } from '@/components/collection/browser/types';

export interface InsuranceLineItem {
  name: string;
  setCode?: string;
  quantity?: number;
  foil?: number;
  condition?: string;
  /** Computed total value of every copy owned — not a per-single snapshot. */
  value: number;
}

interface InsuranceReportProps {
  collectionValue: number;
  cardCount: number;
  topCards?: InsuranceLineItem[];
}

/**
 * A document a user might hand to an insurer, so every number in it comes from
 * the canonical valuation. It previously sorted by computed value and then
 * printed the stale `price_usd` column beside it — usually $0.00.
 */
export function InsuranceReport({
  collectionValue = 0,
  cardCount = 0,
  topCards = [],
}: InsuranceReportProps) {
  const [open, setOpen] = useState(false);

  const items = topCards
    .filter(card => card && card.name)
    .map(card => ({
      ...card,
      value: Number.isFinite(card.value) ? card.value : 0,
      quantity: card.quantity ?? 0,
      foil: card.foil ?? 0,
    }));

  const generateReport = () => {
    const reportDate = new Date().toLocaleDateString();
    const lines: string[] = [
      'MAGIC: THE GATHERING COLLECTION INSURANCE REPORT',
      `Generated: ${reportDate}`,
      '',
      '========================================',
      '',
      'COLLECTION SUMMARY',
      `Total cards: ${cardCount.toLocaleString()}`,
      `Total value: ${formatPrice(collectionValue)}`,
      `Average card value: ${formatPrice(cardCount > 0 ? collectionValue / cardCount : 0)}`,
      '',
    ];

    if (items.length > 0) {
      lines.push('MOST VALUABLE ENTRIES', '========================================');
      items.forEach((card, i) => {
        const copies = card.quantity + card.foil;
        const detail = [
          card.setCode ? card.setCode.toUpperCase() : null,
          `${copies} cop${copies === 1 ? 'y' : 'ies'}`,
          card.foil > 0 ? `${card.foil} foil` : null,
          conditionLabel(card.condition),
        ]
          .filter(Boolean)
          .join(' · ');
        lines.push(`${i + 1}. ${card.name} — ${detail} — ${formatPrice(card.value)}`);
      });
      lines.push('');
    }

    lines.push(
      'This report is for insurance documentation.',
      'Values reflect market prices at the time of generation; foil copies are',
      'valued at foil market price.'
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance-report-${reportDate.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccess('Report downloaded', 'Insurance report saved');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          Insurance report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collection insurance report</DialogTitle>
          <DialogDescription>
            A plain-text valuation document you can send to an insurer
          </DialogDescription>
        </DialogHeader>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
            <CardDescription>Foil copies valued at foil market price</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total cards</p>
                <p className="text-2xl font-bold tabular-nums">{cardCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total value</p>
                <p className="text-2xl font-bold tabular-nums">{formatPrice(collectionValue)}</p>
              </div>
            </div>

            {items.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">Most valuable entries</p>
                <div className="max-h-[220px] space-y-1 overflow-y-auto">
                  {items.map((card, i) => {
                    const copies = card.quantity + card.foil;
                    return (
                      <div
                        key={`${card.name}-${i}`}
                        className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {i + 1}. {card.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {card.setCode && (
                            <span className="font-mono uppercase">{card.setCode}</span>
                          )}
                          <Badge variant="outline" className="h-5 px-1 text-[10px] font-normal">
                            {normalizeCondition(card.condition)}
                          </Badge>
                          <span className="tabular-nums">×{copies}</span>
                        </span>
                        <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                          {formatPrice(card.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No cards in the collection yet — add cards to generate a report.
              </p>
            )}
          </CardContent>
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            Print
          </Button>
          <Button onClick={generateReport} disabled={cardCount === 0}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
