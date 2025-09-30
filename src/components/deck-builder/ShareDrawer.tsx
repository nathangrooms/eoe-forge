import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

interface ShareDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
  currentSlug?: string | null;
  isPublic: boolean;
  onShareToggle: () => void;
}

export function ShareDrawer({
  open,
  onOpenChange,
  deckId,
  deckName,
  currentSlug,
  isPublic,
  onShareToggle,
}: ShareDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    if (currentSlug) {
      setShareUrl(getShareUrl(currentSlug));
    }
  }, [currentSlug]);

  useEffect(() => {
    if (open && isPublic && deckId) {
      loadAnalytics();
    }
  }, [open, isPublic, deckId]);

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
      onShareToggle();
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
      onShareToggle();
      setShowDisableDialog(false);
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
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Share {deckName}</DrawerTitle>
            <DrawerDescription>
              {isPublic
                ? "Manage your public deck link"
                : "Enable public sharing to get a link"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 space-y-6 overflow-y-auto">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="public-toggle">Public Link</Label>
                <p className="text-sm text-muted-foreground">
                  Allow anyone with the link to view this deck
                </p>
              </div>
              <Switch
                id="public-toggle"
                checked={isPublic}
                onCheckedChange={(checked) => {
                  if (checked) {
                    handleEnableSharing();
                  } else {
                    setShowDisableDialog(true);
                  }
                }}
                disabled={loading}
              />
            </div>

            {isPublic && shareUrl && (
              <>
                <Separator />

                {/* Share URL */}
                <div className="space-y-2">
                  <Label>Share Link</Label>
                  <div className="flex gap-2">
                    <Input value={shareUrl} readOnly className="font-mono text-sm" />
                    <Button onClick={handleCopyLink} variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleRegenerateLink}
                    variant="outline"
                    disabled={loading}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                  <Button onClick={handleGenerateQR} variant="outline">
                    <QrCode className="h-4 w-4 mr-2" />
                    QR Code
                  </Button>
                  <Button onClick={handleCopyEmbed} variant="outline" className="col-span-2">
                    <Link2 className="h-4 w-4 mr-2" />
                    Copy Embed Code
                  </Button>
                </div>

                {/* QR Code Display */}
                {qrCodeUrl && (
                  <div className="flex flex-col items-center gap-4 p-4 border rounded-lg">
                    <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQrCodeUrl(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Close
                    </Button>
                  </div>
                )}

                {/* Analytics */}
                {analytics && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <Label>Analytics</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 p-3 border rounded-lg">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-2xl font-bold">{analytics.views}</div>
                            <div className="text-xs text-muted-foreground">Views</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 border rounded-lg">
                          <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-2xl font-bold">{analytics.copies}</div>
                            <div className="text-xs text-muted-foreground">Copies</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Public Sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make your deck private and invalidate the current share link.
              Anyone with the old link will no longer be able to access your deck.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisableSharing} disabled={loading}>
              Disable Sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
