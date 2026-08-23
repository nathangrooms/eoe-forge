import { useState, useEffect } from "react";
import { FIELD, MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, QrCode, Link2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  enableDeckShare,
  disableDeckShare,
  regenerateDeckSlug,
  getShareAnalytics,
} from "@/lib/api/shareAPI";
import { getShareUrl } from "@/lib/shareUtils";
import QRCode from "qrcode";

interface DeckSharePanelProps {
  deckId: string;
  deckName: string;
  currentSlug?: string | null;
  isPublic: boolean;
  onShareToggle?: () => void;
}

/**
 * Deck sharing, in the page.
 *
 * This was `ShareDrawer`: a 90vh drawer with an `AlertDialog` nested inside it,
 * so turning sharing off stacked a modal on top of a modal. It is now the body
 * of `/deck/:id/share`, and the disable step is an inline confirmation row that
 * replaces the button in place — the link it is about to invalidate stays
 * visible above it while you decide.
 */
export function DeckSharePanel({
  deckId,
  deckName,
  currentSlug,
  isPublic,
  onShareToggle,
}: DeckSharePanelProps) {
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  /**
   * Sharing state is owned here.
   *
   * The prop only seeds this state; the panel updates itself after every
   * enable/disable so the switch never snaps back to a stale value.
   */
  const [enabled, setEnabled] = useState(isPublic);

  useEffect(() => {
    setEnabled(isPublic);
    if (isPublic && currentSlug) {
      setShareUrl(getShareUrl(currentSlug));
      loadAnalytics();
    } else {
      setShareUrl('');
      setAnalytics(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic, currentSlug, deckId]);

  const loadAnalytics = async () => {
    try {
      const data = await getShareAnalytics(deckId);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  const handleEnableSharing = async () => {
    setLoading(true);
    try {
      const result = await enableDeckShare(deckId);
      setShareUrl(result.url);
      setEnabled(true);
      onShareToggle?.();
      await loadAnalytics();
      toast.success("Deck sharing enabled");
    } catch (err) {
      toast.error("Failed to enable sharing");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisableSharing = async () => {
    setLoading(true);
    try {
      await disableDeckShare(deckId);
      setShareUrl("");
      setEnabled(false);
      setAnalytics(null);
      setQrCodeUrl(null);
      onShareToggle?.();
      setConfirmingDisable(false);
      toast.success("Deck sharing disabled");
    } catch (err) {
      toast.error("Failed to disable sharing");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateLink = async () => {
    setLoading(true);
    try {
      const result = await regenerateDeckSlug(deckId);
      setShareUrl(result.url);
      setQrCodeUrl(null);
      toast.success("New share link generated");
    } catch (err) {
      toast.error("Failed to regenerate link");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleGenerateQR = async () => {
    try {
      const qr = await QRCode.toDataURL(shareUrl, { width: 300 });
      setQrCodeUrl(qr);
    } catch (err) {
      toast.error("Failed to generate QR code");
    }
  };

  const handleCopyEmbed = async () => {
    const embedCode = `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0"></iframe>`;
    try {
      await navigator.clipboard.writeText(embedCode);
      toast.success("Embed code copied");
    } catch (err) {
      toast.error("Failed to copy embed code");
    }
  };

  return (
    /*
      The full column, not `max-w-2xl`.

      This panel kept the width it had as a 90vh drawer, so as a page it drew a
      672px strip against the left edge of a 1288px band and left the rest
      empty. Export made the same move and was widened when it became a route;
      this one was missed. The link and the QR code do not want the same width,
      so the second half is two tracks: the link, its buttons and the embed code
      on the left, the QR image and the counts on the right, where a 192px
      square and a two-figure row both fit without stretching.
    */
    <div className="space-y-4">
      {/* Enable / disable */}
      <div className="rounded-lg bg-card p-4 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="public-toggle">Public link</Label>
            <p className="text-sm text-muted-foreground">
              Allow anyone with the link to view “{deckName}”
            </p>
          </div>
          <Switch
            id="public-toggle"
            checked={enabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setConfirmingDisable(false);
                handleEnableSharing();
              } else {
                /* Stay on until the inline confirmation below is answered. */
                setConfirmingDisable(true);
              }
            }}
            disabled={loading}
          />
        </div>

        {/* Inline confirmation — replaces the AlertDialog this panel used to stack. */}
        {confirmingDisable && (
          <div className="mt-4 rounded-lg bg-muted/40 p-3">
            <p className="text-sm">
              Make this deck private? The current link stops working immediately and anyone
              holding it loses access.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDisableSharing}
                disabled={loading}
              >
                Disable sharing
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDisable(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {enabled && shareUrl && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-2 rounded-lg bg-card p-4 shadow-lg shadow-black/20">
            <Label htmlFor="deck-share-url">Share link</Label>
            <div className="flex gap-2">
              <Input
                id="deck-share-url"
                value={shareUrl}
                readOnly
                className={cn(FIELD, 'font-mono text-sm')}
              />
              <Button onClick={handleCopyLink} variant="secondary" size="icon">
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button onClick={handleRegenerateLink} variant="secondary" disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
              <Button onClick={handleGenerateQR} variant="secondary">
                <QrCode className="mr-2 h-4 w-4" />
                QR code
              </Button>
              <Button onClick={handleCopyEmbed} variant="secondary" className="col-span-2">
                <Link2 className="mr-2 h-4 w-4" />
                Copy embed code
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-4 shadow-lg shadow-black/20">
                <img src={qrCodeUrl} alt="QR code for this deck's share link" className="h-48 w-48" />
                <Button variant="ghost" size="sm" onClick={() => setQrCodeUrl(null)}>
                  <X className="mr-2 h-4 w-4" />
                  Hide QR code
                </Button>
              </div>
            )}

            {analytics && (
              <div className="space-y-3 rounded-lg bg-card p-4 shadow-lg shadow-black/20">
                <Label>Analytics</Label>
                {/*
                Two figures that used to be hand-built: a 40px icon square, the
                value above the label rather than under it, and `font-bold`
                where every other figure in the product is `font-semibold`. The
                icons are the specific thing the owner ruled out on this exact
                kind of tile — "Deck manage metrics dont need icons - makes it
                look like ai slop" — and `MetricRow` has no `icon` prop, which
                is how that ruling is kept rather than remembered.

                `on="card"`: this is a row inside a panel that is already
                raised, so the tiles are the recessed treatment.
              */}
                <MetricRow
                  on="card"
                  columns={2}
                  metrics={[
                    {
                      id: 'views',
                      label: 'Views',
                      value: analytics.views.toLocaleString(),
                      raw: analytics.views,
                    },
                    {
                      id: 'copies',
                      label: 'Copies',
                      value: analytics.copies.toLocaleString(),
                      raw: analytics.copies,
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DeckSharePanel;
