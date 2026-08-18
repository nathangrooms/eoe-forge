import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Copy,
  QrCode,
  Link2,
  RefreshCw,
  Eye,
  MousePointerClick,
  X,
} from "lucide-react";
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
    <div className="max-w-2xl space-y-4">
      {/* Enable / disable */}
      <div className="rounded-xl bg-card p-4 shadow-sm">
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
        <>
          <div className="space-y-2 rounded-xl bg-card p-4 shadow-sm">
            <Label htmlFor="deck-share-url">Share link</Label>
            <div className="flex gap-2">
              <Input
                id="deck-share-url"
                value={shareUrl}
                readOnly
                className="font-mono text-sm"
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

            {qrCodeUrl && (
              <div className="mt-2 flex flex-col items-center gap-4 rounded-lg bg-muted/40 p-4">
                <img src={qrCodeUrl} alt="QR code for this deck's share link" className="h-48 w-48" />
                <Button variant="ghost" size="sm" onClick={() => setQrCodeUrl(null)}>
                  <X className="mr-2 h-4 w-4" />
                  Hide QR code
                </Button>
              </div>
            )}
          </div>

          {analytics && (
            <div className="space-y-3 rounded-xl bg-card p-4 shadow-sm">
              <Label>Analytics</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold tabular-nums">{analytics.views}</div>
                    <div className="text-xs text-muted-foreground">Views</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
                  <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold tabular-nums">{analytics.copies}</div>
                    <div className="text-xs text-muted-foreground">Copies</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default DeckSharePanel;
