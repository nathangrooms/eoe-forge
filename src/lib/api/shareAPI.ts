import { supabase } from "@/integrations/supabase/client";
import { generateSlug, hashString } from "@/lib/shareUtils";
import type { DeckSummary } from "@/lib/api/deckAPI";

export interface ShareEnableParams {
  showLatest?: boolean;
}

export interface ShareResponse {
  public_slug: string;
  url: string;
  published_at: string;
}

export interface PublicDeckSummary extends DeckSummary {
  cards: any[];
}

export interface PublicDeckData {
  deck: PublicDeckSummary;
  viewCount: number;
  publishedAt: string;
}

/**
 * Enable public sharing for a deck
 */
export async function enableDeckShare(
  deckId: string,
  params: ShareEnableParams = {}
): Promise<ShareResponse> {
  const slug = generateSlug(8);
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('user_decks')
    .update({
      public_enabled: true,
      public_slug: slug,
      public_show_latest: params.showLatest ?? true,
      published_at: now,
    })
    .eq('id', deckId)
    .select('public_slug, published_at')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Failed to enable sharing');

  return {
    public_slug: data.public_slug!,
    url: `${window.location.origin}/p/${data.public_slug}`,
    published_at: data.published_at!,
  };
}

/**
 * Disable public sharing for a deck
 */
export async function disableDeckShare(deckId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from('user_decks')
    .update({
      public_enabled: false,
      public_slug: null,
      published_at: null,
    })
    .eq('id', deckId);

  if (error) throw error;
  return { ok: true };
}

/**
 * Regenerate public slug for a deck (invalidates old link)
 */
export async function regenerateDeckSlug(deckId: string): Promise<ShareResponse> {
  const slug = generateSlug(8);
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('user_decks')
    .update({
      public_slug: slug,
      published_at: now,
    })
    .eq('id', deckId)
    .eq('public_enabled', true)
    .select('public_slug, published_at')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Sharing not enabled for this deck');

  return {
    public_slug: data.public_slug!,
    url: `${window.location.origin}/p/${data.public_slug}`,
    published_at: data.published_at!,
  };
}

/**
 * Get public deck data by slug
 */
export async function getPublicDeck(slug: string): Promise<PublicDeckData | null> {
  // Get basic deck info
  const { data: deckData, error: deckError } = await supabase.rpc('get_public_deck', {
    deck_slug: slug,
  });

  if (deckError || !deckData) return null;

  const deckInfo = deckData as any;

  // Get full deck summary using compute_deck_summary
  const { data: summary, error: summaryError } = await supabase.rpc('compute_deck_summary', {
    deck_id: deckInfo.id,
  });

  if (summaryError || !summary) return null;

  return {
    deck: summary as unknown as PublicDeckSummary,
    viewCount: deckInfo.view_count || 0,
    publishedAt: deckInfo.published_at,
  };
}

/**
 * Track share event
 */
export async function trackShareEvent(
  slug: string,
  event: 'view' | 'copy' | 'qr' | 'embed'
): Promise<void> {
  try {
    // Get deck ID from slug
    const { data: deckData } = await supabase
      .from('user_decks')
      .select('id')
      .eq('public_slug', slug)
      .eq('public_enabled', true)
      .single();

    if (!deckData) return;

    // Hash UA and IP for privacy
    const ua = navigator.userAgent;
    const uaHash = await hashString(ua);

    // Insert event
    await supabase.from('deck_share_events').insert({
      deck_id: deckData.id,
      slug,
      event,
      ua_hash: uaHash,
      ip_hash: null, // Client-side can't access IP
    });

    // Increment view count for 'view' events
    if (event === 'view') {
      await supabase.rpc('increment_share_views', { deck_slug: slug });
    }
  } catch (err) {
    console.error('Failed to track share event:', err);
  }
}

/**
 * Get share analytics for a deck
 */
export async function getShareAnalytics(deckId: string) {
  const { data, error } = await supabase
    .from('deck_share_events')
    .select('event, created_at')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const events = data || [];
  const viewCount = events.filter(e => e.event === 'view').length;
  const copyCount = events.filter(e => e.event === 'copy').length;
  const qrCount = events.filter(e => e.event === 'qr').length;
  const embedCount = events.filter(e => e.event === 'embed').length;

  return {
    total: events.length,
    views: viewCount,
    copies: copyCount,
    qrScans: qrCount,
    embeds: embedCount,
    recentEvents: events.slice(0, 10),
  };
}
