import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'MTGDeckBuilder/1.0';
const RATE_LIMIT_DELAY = 120; // 120ms between requests (safer rate limit)
/**
 * Rows per upsert statement.
 *
 * This is a statement-timeout budget, not a memory one. PostgREST connects as
 * `authenticator`, whose role settings carry `statement_timeout=8s`, and a
 * write to `cards` is expensive: 23 indexes including five GIN, plus the
 * role-tagging trigger, which fires twice per upserted row (once on the
 * proposed INSERT, once on the conflicting UPDATE).
 *
 * Measured 2026-08-19 with EXPLAIN ANALYZE, re-upserting existing rows so the
 * shape matches what the sync does:
 *
 *   100 rows ... 6,736 ms   (trigger 1,737 ms, the rest index and heap writes)
 *    25 rows ... 1,192 ms   (trigger   240 ms)
 *
 * Linear at roughly 48 ms per row. At 100 the statement sat at 84% of the
 * timeout with nothing to spare, and the first live run at unique=prints died
 * on page 41 with 57014 while another process was reading the table. 25 leaves
 * six times the headroom.
 */
const BATCH_SIZE = 25;

/**
 * Pages per invocation, before handing off to the next run.
 *
 * 175 cards per page at ~48 ms each is about 8.4 s of writing per page, so 15
 * pages is roughly 125 s of work inside an edge function. The catalogue is 553
 * pages, so a full run is around 37 chained invocations.
 */
const MAX_PAGES_PER_RUN = 15;

/**
 * How many times to halve a batch that timed out before giving up.
 *
 * A timeout is usually a busy moment rather than a broken row: something else
 * was reading `cards` when this statement wanted to write it. Halving and
 * retrying rides that out, where failing the page loses the whole page and
 * waits fifteen minutes for the watchdog. Four halvings takes 25 rows down to
 * a single row; if one row cannot be written in eight seconds the problem is
 * not contention and the error deserves to surface.
 */
const MAX_BATCH_SPLITS = 4;

/**
 * The catalogue query, in ONE place.
 *
 * `unique` is the whole argument. Scryfall offers three values and they are not
 * a preference; they change what we hold:
 *
 *   unique=cards   one row per card. Every alternate art, borderless, extended
 *                  art, showcase, promo and reprint is discarded at the source.
 *   unique=art     one row per distinct artwork.
 *   unique=prints  every printing.
 *
 * This sync asked for `cards`, so the table held 34,088 rows over 33,037
 * distinct oracle_ids: 1.03 printings per card, which is to say one printing of
 * everything. Measured against Scryfall on 2026-08-19 for this exact query:
 *
 *   unique=cards   32,726
 *   unique=art     47,604
 *   unique=prints  96,732
 *
 * Three things need the printing and cannot be built without it. Collection
 * value is per printing, because printings of one card differ enormously in
 * price and valuing everything at a single printing's price is simply wrong.
 * The scanner identifies a card BY its artwork and has nothing to match against
 * when only one printing exists. A marketplace listing is always for a specific
 * printing.
 *
 * The duplicate problem this creates is handled in the database, not here.
 * `public.cards` holds every printing; `public.cards_unique` holds one row per
 * oracle_id (cheapest printing, ties on lowest id) and is the default source
 * for search, commanders, suggestions and candidate pools.
 */
const CATALOGUE_QUERY = '-is%3Adigital+game%3Apaper';
const CATALOGUE_UNIQUE = 'prints';

function cataloguePageUrl(page: number): string {
  return `https://api.scryfall.com/cards/search?q=${CATALOGUE_QUERY}&unique=${CATALOGUE_UNIQUE}&page=${page}`;
}

/**
 * Is a stored resume pointer still describing the catalogue we want?
 *
 * The pointer is a whole Scryfall URL frozen at the moment a run paused, so it
 * carries the `unique` value that was in force then. When this constant
 * changes, every stored pointer is describing the OLD catalogue, and resuming
 * it would page through 187 pages of single printings and then declare the
 * sync complete. The pointer has frozen this sync before; it is worth one
 * explicit check.
 */
function pointerMatchesCatalogue(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(`unique=${CATALOGUE_UNIQUE}`);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * One side of a multi-face card. Scryfall puts the printed characteristics of a
 * transform / modal DFC / split / adventure card on the faces, NOT on the card:
 * a Delver of Secrets row has no top-level oracle_text, mana_cost or power at
 * all. Anything the UI needs per side has to be read off here, so every such
 * field is declared — a narrower type silently discards the rest.
 */
interface ScryfallCardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_indicator?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  flavor_text?: string;
  artist?: string;
  image_uris?: Record<string, string>;
}

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  layout: string;
  type_line: string;
  cmc: number;
  colors?: string[];
  color_identity?: string[];
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
  legalities: Record<string, string>;
  image_uris?: Record<string, string>;
  card_faces?: ScryfallCardFace[];
  prices?: Record<string, string>;
  rarity: string;
  reserved?: boolean;
  games?: string[];

  /**
   * Printing identity. Every one of these was already on the card object and
   * already being thrown away; they are what makes one printing tellable from
   * another, which is the point of holding every printing at all.
   */
  artist?: string;
  illustration_id?: string;
  released_at?: string;
  set_name?: string;
  finishes?: string[];
  border_color?: string;
  frame_effects?: string[];
  full_art?: boolean;
  variation?: boolean;
  promo?: boolean;

  /** EDHREC popularity rank. Absent on roughly one card in a hundred. */
  edhrec_rank?: number;

  /** Wizards' Commander Bracket "Game Changer" flag. */
  game_changer?: boolean;
}

/**
 * Layouts Scryfall ships with a `card_faces` array.
 *
 * This list is a repair hint for `backfillFaces`, NOT a gate on the main sync
 * path — `transformFaces` reads `card.card_faces` directly and so handles any
 * layout, including ones invented after this file was written.
 *
 * It has already gone stale once and cost real data. Wizards added the
 * `prepare` layout with Secrets of Strixhaven (`sos`/`soc`/`fra`); because it
 * was absent here, `backfillFaces` never visited those rows and 52 cards sat
 * with a null `oracle_text` AND a null `faces` — invisible to the ability
 * compiler, which reads `faces ?? card_faces` and had nothing to read.
 *
 * `backfillFaces` no longer depends on this list alone (it also sweeps rows
 * that are symptomatic regardless of layout), but keep it current anyway: it
 * is what makes the targeted repair cheap.
 */
const MULTI_FACE_LAYOUTS = [
  'transform',
  'modal_dfc',
  'double_faced_token',
  'reversible_card',
  'split',
  'flip',
  'adventure',
  'prepare',
  'art_series',
];

/** Scryfall's /cards/collection endpoint takes at most 75 identifiers. */
const COLLECTION_BATCH = 75;

interface SyncState {
  next_page_url: string | null;
  total_processed: number;
  total_cards: number;
  current_page: number;
}

async function updateSyncStatus(
  status: string, 
  processed?: number, 
  total?: number, 
  step?: string, 
  stepProgress?: number,
  stateJson?: string | null
) {
  const updateData: Record<string, any> = { 
    status, 
    last_sync: new Date().toISOString() 
  };
  
  if (processed !== undefined) updateData.records_processed = processed;
  if (total !== undefined) updateData.total_records = total;
  if (step) updateData.current_step = step;
  if (stepProgress !== undefined) updateData.step_progress = stepProgress;
  if (stateJson !== undefined) updateData.error_message = stateJson;

  await supabase.from('sync_status').upsert({ id: 'scryfall_cards', ...updateData }, { onConflict: 'id' });
}

async function getSyncState(): Promise<SyncState | null> {
  const { data } = await supabase
    .from('sync_status')
    .select('*')
    .eq('id', 'scryfall_cards')
    .maybeSingle();
  
  // Try to parse state from error_message field (used to store resume state)
  if (data?.error_message) {
    try {
      const parsed = JSON.parse(data.error_message);
      if (parsed.next_page_url && parsed.current_page) {
        // A pointer written under a different `unique` value describes a
        // different catalogue. Following it would walk the old, smaller result
        // set to its end and then mark the sync complete, which is exactly how
        // a stale pointer froze this sync once already. Discard it and start
        // over rather than finish the wrong job.
        if (!pointerMatchesCatalogue(parsed.next_page_url)) {
          console.log('🧹 Discarding resume pointer from a previous catalogue mode');
          return null;
        }
        return parsed as SyncState;
      }
    } catch { /* not valid JSON */ }
  }

  // If running/stuck but no resume state, try to reconstruct from step_progress.
  // Page numbers are not comparable across catalogue modes either: page 46 of
  // 187 single printings is nowhere near page 46 of 553 printings. Only rebuild
  // when the stored progress was written under the current mode, which is what
  // a matching pointer above would have proven. It did not, so start fresh.
  if (data?.status === 'running' && data?.step_progress > 0
      && pointerMatchesCatalogue(data?.error_message)) {
    const pageNum = data.step_progress;
    return {
      next_page_url: cataloguePageUrl(pageNum),
      total_processed: data.records_processed || 0,
      total_cards: data.total_records || 0,
      current_page: pageNum
    };
  }

  return null;
}

async function saveSyncState(state: SyncState) {
  await supabase.from('sync_status').upsert({ 
    id: 'scryfall_cards',
    status: 'running',
    current_step: 'resumable',
    records_processed: state.total_processed,
    total_records: state.total_cards,
    step_progress: state.current_page,
    error_message: JSON.stringify(state),
    last_sync: new Date().toISOString()
  }, { onConflict: 'id' });
}

/**
 * Applies the role tagger to the rows this run just wrote.
 *
 * Tags used to be computed here, by `text.includes('add') && text.includes('mana')`
 * and four rules like it. That yielded card TYPES plus noise — `removal` fired on
 * any text containing "exile", `tokens` on any text containing "token" — and gave
 * Sol Ring no role at all. The classifier now lives in exactly one place,
 * `public.derive_card_tags`, generated from `src/lib/cards/tagger.ts`.
 *
 * The `cards_apply_role_tags` trigger already tags every row as it is written, so
 * this call is belt-and-braces. It is here so that tagging on arrival is visible
 * in the sync itself: if the trigger is ever dropped, the sync still produces
 * tagged rows rather than silently regressing to untagged ones.
 *
 * Cheap now that `derive_card_tags` is memoised on its arguments
 * (public.card_tag_memo): measured 31.3 ms per card computing from scratch
 * against 0.40 ms on a cache hit, so re-deriving what the trigger just derived
 * costs a lookup rather than a second classification.
 *
 * Never fatal. Cards that are saved but not yet tagged are fixed by the next
 * `retag` pass; cards that are not saved at all are lost work.
 */
async function tagWrittenCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc('retag_cards', { p_ids: ids });
  if (error) console.warn(`⚠️ retag_cards failed for ${ids.length} ids: ${error.message}`);
}

/**
 * Rebuild `public.cards_unique`, the one-row-per-card view the rest of the
 * product searches.
 *
 * It is a materialized view, so it does not update itself when `cards` changes.
 * Refreshing is CONCURRENT inside the function, so readers keep seeing the
 * previous contents until the new ones are ready and nobody sees an empty
 * catalogue mid-refresh.
 */
async function refreshCardsUnique(): Promise<void> {
  const { data, error } = await supabase.rpc('refresh_cards_unique');
  if (error) {
    console.warn(`⚠️ refresh_cards_unique failed: ${error.message}`);
    return;
  }
  console.log(`🔁 ${data}`);
}

/** Postgres cancels a statement that outran statement_timeout with SQLSTATE 57014. */
function isStatementTimeout(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '57014' || (error.message ?? '').includes('statement timeout');
}

/**
 * Write one batch, halving it and retrying if the statement times out.
 *
 * The alternative was to make BATCH_SIZE small enough that a timeout is
 * impossible, but there is no such number: the budget is shared with whatever
 * else is reading the table at that moment, and `cards` is read by the whole
 * app. So the batch size is chosen for the normal case and this handles the
 * busy one.
 *
 * Splitting rather than simply retrying matters because the two halves are two
 * statements with a fresh eight seconds each, so the retry is genuinely cheaper
 * than the attempt that failed rather than the same gamble again.
 *
 * Any error that is not a timeout is thrown immediately. A malformed row will
 * not fix itself by being sent in smaller groups, and retrying it would turn
 * one clear failure into sixteen confusing ones.
 */
async function upsertCards(rows: Record<string, unknown>[], depth = 0): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('cards')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

  if (!error) return;

  if (!isStatementTimeout(error) || rows.length === 1 || depth >= MAX_BATCH_SPLITS) {
    throw new Error(`DB error: ${error.message}`);
  }

  const half = Math.ceil(rows.length / 2);
  console.warn(`⏳ Upsert of ${rows.length} timed out; splitting into ${half} + ${rows.length - half}`);
  await upsertCards(rows.slice(0, half), depth + 1);
  await upsertCards(rows.slice(half), depth + 1);
}

function getImageUris(card: ScryfallCard): Record<string, string> {
  if (card.image_uris) return card.image_uris;
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris;
  return {};
}

/**
 * The per-face payload for the `faces` jsonb column, in Scryfall's own shape so
 * that a row read from Postgres and a card fetched live from the API are
 * interchangeable (`src/lib/scryfall/card-utils.ts` reads `card_faces` first,
 * then `faces`).
 *
 * Keys that are absent upstream are dropped rather than written as null: the UI
 * decides a card has a real back face by testing `faces[1].image_uris`, and
 * split/adventure/flip cards legitimately have no per-face art. Writing an
 * empty object there would make every one of them claim a flippable back.
 *
 * Returns null — not [] — for single-faced cards so `faces is not null` means
 * exactly "this card has faces".
 */
function transformFaces(card: ScryfallCard): Record<string, unknown>[] | null {
  const faces = card.card_faces;
  if (!Array.isArray(faces) || faces.length === 0) return null;

  return faces.map((face) => {
    const out: Record<string, unknown> = {};
    const copy = (key: keyof ScryfallCardFace) => {
      const value = face?.[key];
      if (value !== undefined && value !== null) out[key] = value;
    };

    copy('name');
    copy('mana_cost');
    copy('type_line');
    copy('oracle_text');
    copy('colors');
    copy('color_indicator');
    copy('power');
    copy('toughness');
    copy('loyalty');
    copy('defense');
    copy('flavor_text');
    copy('artist');
    copy('image_uris');

    return out;
  });
}

function transformCard(card: ScryfallCard) {
  return {
    id: card.id,
    oracle_id: card.oracle_id || card.id,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number,
    layout: card.layout || 'normal',
    type_line: card.type_line || 'Unknown',
    cmc: card.cmc || 0,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    oracle_text: card.oracle_text,
    mana_cost: card.mana_cost,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    keywords: card.keywords || [],
    legalities: card.legalities || {},
    image_uris: getImageUris(card),
    // Without this every double-faced card in our own table loses its back
    // side, and any surface that does not re-fetch from Scryfall cannot flip.
    faces: transformFaces(card),
    prices: card.prices || {},
    is_legendary: (card.type_line || '').toLowerCase().includes('legendary'),
    is_reserved: card.reserved || false,
    rarity: card.rarity || 'common',

    // --- Printing identity ------------------------------------------------
    // Null rather than a default when Scryfall omits the field, so "we do not
    // know" stays distinguishable from "false" or "empty". A borderless
    // printing with `border_color: null` would be a lie; a missing one is not.
    artist: card.artist ?? null,
    illustration_id: card.illustration_id ?? null,
    released_at: card.released_at ?? null,
    set_name: card.set_name ?? null,
    finishes: card.finishes ?? null,
    border_color: card.border_color ?? null,
    frame_effects: card.frame_effects ?? null,
    full_art: card.full_art ?? null,
    variation: card.variation ?? null,
    promo: card.promo ?? null,
    edhrec_rank: card.edhrec_rank ?? null,
    game_changer: card.game_changer ?? null,
    // `tags` is deliberately absent. It is owned by the cards_apply_role_tags
    // trigger, which calls public.derive_card_tags on every insert and on any
    // update that touches name/type_line/oracle_text/keywords/mana_cost/cmc/faces.
    // Sending a value here would only be overwritten, and omitting it means an
    // upsert that changes nothing but prices leaves the existing tags untouched.
  };
}

async function fetchPage(url: string): Promise<{ cards: ScryfallCard[]; nextPage: string | null; total: number }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
  });
  
  if (response.status === 404 || response.status === 422) {
    return { cards: [], nextPage: null, total: 0 };
  }
  
  if (!response.ok) {
    throw new Error(`Scryfall API error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    cards: data.data || [],
    nextPage: data.has_more ? data.next_page : null,
    total: data.total_cards || 0
  };
}

async function syncCards(resumeState?: SyncState): Promise<{ success: boolean; processed: number; needsResume: boolean; error?: string }> {
  console.log('🚀 Starting card sync from Scryfall...');
  
  try {
    let totalProcessed = resumeState?.total_processed || 0;
    let currentPage = resumeState?.current_page || 1;
    let estimatedTotal = resumeState?.total_cards || 0;
    let pagesProcessedThisRun = 0;
    
    // Start URL
    let currentUrl: string | null = resumeState?.next_page_url || cataloguePageUrl(1);
    
    if (!resumeState) {
      await updateSyncStatus('running', 0, 0, 'initializing', 0);
    } else {
      console.log(`📌 Resuming from page ${currentPage}, ${totalProcessed} cards processed`);
    }
    
    while (currentUrl && pagesProcessedThisRun < MAX_PAGES_PER_RUN) {
      try {
        console.log(`📦 Fetching page ${currentPage}...`);
        
        const { cards, nextPage, total } = await fetchPage(currentUrl);
        
        if (currentPage === 1 && !resumeState) {
          estimatedTotal = total;
          console.log(`📊 Total cards to sync: ${estimatedTotal}`);
        }
        
        if (cards.length === 0) {
          console.log('✅ No more cards - sync complete');
          break;
        }
        
        // Filter out tokens and transform
        const validCards = cards.filter(c => c.type_line && !c.type_line.includes('Token'));
        const transformed = validCards.map(transformCard);
        
        if (transformed.length > 0) {
          // Insert in smaller batches
          for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
            const batch = transformed.slice(i, i + BATCH_SIZE);
            try {
              await upsertCards(batch);
            } catch (writeError) {
              console.error(`❌ DB error on page ${currentPage}:`, (writeError as Error).message);
              await saveSyncState({
                next_page_url: currentUrl,
                total_processed: totalProcessed,
                total_cards: estimatedTotal,
                current_page: currentPage
              });
              throw writeError;
            }

            await tagWrittenCards(batch.map((c) => c.id));
          }

          totalProcessed += transformed.length;
          console.log(`✅ Page ${currentPage}: saved ${transformed.length} cards (total: ${totalProcessed})`);
        }
        
        // Update status every 5 pages
        if (currentPage % 5 === 0) {
          await updateSyncStatus('running', totalProcessed, estimatedTotal, 'processing', currentPage);
        }
        
        currentUrl = nextPage;
        currentPage++;
        pagesProcessedThisRun++;
        
        // Rate limit
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
        
      } catch (pageError) {
        console.error(`❌ Error on page ${currentPage}:`, (pageError as Error).message);
        await saveSyncState({
          next_page_url: currentUrl,
          total_processed: totalProcessed,
          total_cards: estimatedTotal,
          current_page: currentPage
        });
        throw pageError;
      }
    }
    
    // Check if we need to continue
    if (currentUrl && pagesProcessedThisRun >= MAX_PAGES_PER_RUN) {
      console.log(`⏸️ Pausing sync after ${pagesProcessedThisRun} pages. Will auto-resume...`);
      await saveSyncState({
        next_page_url: currentUrl,
        total_processed: totalProcessed,
        total_cards: estimatedTotal,
        current_page: currentPage
      });
      
      return { success: true, processed: totalProcessed, needsResume: true };
    }
    
    console.log(`🎉 Sync complete! Total: ${totalProcessed} cards`);
    // Pass null (not undefined) so the stored resume state is CLEARED. Leaving it set
    // marks the sync "completed" while it still holds a next_page_url, which makes a
    // partial sync look finished and confuses the next resume attempt.
    await updateSyncStatus('completed', totalProcessed, totalProcessed, 'complete', currentPage, null);

    // The deduplicated view is derived from the table we just rewrote, and the
    // chosen printing is the cheapest one, so new printings and new prices both
    // change it. Refreshing here is what keeps "one row per card" honest;
    // without it every search would keep answering from the previous catalogue.
    // Never fatal: a stale view is worse than a fresh one but far better than a
    // sync that reports failure after successfully writing every card.
    await refreshCardsUnique();

    return { success: true, processed: totalProcessed, needsResume: false };
    
  } catch (error) {
    const message = (error as Error).message;
    console.error('💥 Sync failed:', message);
    return { success: false, processed: 0, needsResume: false, error: message };
  }
}

/**
 * Repairs rows written before `faces` was persisted, without re-walking the
 * whole 34k-card catalogue: only candidate multi-face rows are visited, 75 at a
 * time through Scryfall's /cards/collection endpoint.
 *
 * A candidate is a row whose layout is in MULTI_FACE_LAYOUTS *or* whose name
 * carries Scryfall's ' // ' face separator. The name test is what makes this
 * robust — the layout allowlist alone silently missed all 52 `prepare`-layout
 * cards when that layout shipped with Secrets of Strixhaven, leaving them with
 * neither `oracle_text` nor `faces` and therefore invisible to the ability
 * compiler.
 *
 * Pagination is keyset on `id` (not offset) so it still terminates when a card
 * comes back from Scryfall with no `card_faces` — those rows stay null but sit
 * behind the cursor instead of being handed out forever.
 */
async function backfillFaces(opts: { onlyMissing?: boolean; deadlineMs?: number } = {}) {
  const onlyMissing = opts.onlyMissing !== false;
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);

  let scanned = 0;
  let updated = 0;
  let notFound = 0;
  let noFaces = 0;
  let remaining = false;
  let lastId = '';

  console.log(`🔧 Backfilling faces (onlyMissing=${onlyMissing})...`);

  while (true) {
    if (Date.now() > deadline) {
      remaining = true;
      break;
    }

    // `.is()` only exists on the filter builder, so every filter has to be
    // applied before .order()/.limit() turn it into a transform builder.
    //
    // Selection is deliberately NOT the layout allowlist alone. That allowlist
    // went stale when Wizards added the `prepare` layout and 52 cards were
    // never visited. A multi-face card is identified far more reliably by its
    // name carrying Scryfall's ' // ' face separator: measured against the live
    // table, every one of the 802 rows that had `faces` also has '//' in its
    // name (zero false negatives), and the pattern additionally caught the 52
    // `prepare` rows the allowlist missed — whatever their layout. Matching on
    // either keeps new layouts working without a code change.
    //
    // Exactly one false positive exists in 34,088 rows: 'SP//dr, Piloted by
    // Peni' is a single-faced `normal` card with '//' inside its printed name.
    // It costs one wasted slot in one /cards/collection batch — Scryfall
    // returns it with no `card_faces`, it is counted as noFaces, and the keyset
    // cursor moves past it rather than handing it out again.
    let filter = supabase
      .from('cards')
      .select('id')
      .or(`layout.in.(${MULTI_FACE_LAYOUTS.join(',')}),name.like.*//*`)
      .gt('id', lastId);

    if (onlyMissing) filter = filter.is('faces', null);

    const { data: rows, error } = await filter
      .order('id', { ascending: true })
      .limit(COLLECTION_BATCH);
    if (error) throw new Error(`DB read failed: ${error.message}`);
    if (!rows || rows.length === 0) break;

    lastId = rows[rows.length - 1].id;
    scanned += rows.length;

    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifiers: rows.map((r) => ({ id: r.id })) }),
    });

    if (!response.ok) {
      throw new Error(`Scryfall collection error: ${response.status}`);
    }

    const payload = await response.json();
    const cards: ScryfallCard[] = payload.data || [];
    notFound += (payload.not_found || []).length;

    const withFaces = cards.filter((c) => Array.isArray(c.card_faces) && c.card_faces.length > 0);
    noFaces += cards.length - withFaces.length;

    if (withFaces.length > 0) {
      // Same batching and timeout handling as the main path: 75 rows of a
      // 23-index table in one statement is well past the eight-second budget.
      const repaired = withFaces.map(transformCard);
      for (let i = 0; i < repaired.length; i += BATCH_SIZE) {
        await upsertCards(repaired.slice(i, i + BATCH_SIZE));
      }
      // Faces carry the oracle text of every side, and for 802 rows they carry
      // the ONLY oracle text — so a face backfill changes what these cards are
      // classified as, and they have to be re-tagged with it.
      await tagWrittenCards(withFaces.map((c) => c.id));
      updated += withFaces.length;
      console.log(`✅ Backfilled ${updated} cards (scanned ${scanned})`);
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
  }

  console.log(`🎉 Backfill done: ${updated} updated, ${scanned} scanned, ${noFaces} single-faced, ${notFound} not found`);
  return { scanned, updated, noFaces, notFound, remaining };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let action = 'sync';
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) || {};
      action = body.action || 'sync';
    } catch { /* default to sync */ }

    if (action === 'status') {
      const { data } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      return new Response(JSON.stringify(data || { status: 'never' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'stop') {
      await updateSyncStatus('stopped', undefined, undefined, 'stopped', undefined, 'Manually stopped');
      return new Response(JSON.stringify({ message: 'Sync stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    /**
     * Reclassify the whole catalogue. Needed after TAG_RULES changes, since the
     * trigger only fires on rows that are written and an oracle text that has
     * not changed will never be revisited.
     *
     * Re-runnable and resumable: it walks a keyset cursor held in
     * `card_retag_progress` and returns after `budget_seconds`, so call it again
     * until `done` is true. `restart: true` starts from the beginning, and also
     * empties public.card_tag_memo so the old classification is not handed back.
     */
    if (action === 'retag') {
      const { data, error } = await supabase.rpc('retag_all_cards', {
        // Under the database's 120s statement_timeout, which is armed before the
        // function body runs and cannot be widened from inside it.
        p_budget_seconds: typeof body.budget_seconds === 'number' ? body.budget_seconds : 100,
        p_page: typeof body.page === 'number' ? body.page : 500,
        p_restart: body.restart === true,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const state = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify({
        ...state,
        message: state?.done
          ? `Re-tag complete. ${state.changed} of ${state.scanned} cards changed.`
          : `Re-tagged ${state?.scanned ?? 0} cards so far; call again to continue.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /**
     * Rebuild the one-row-per-card view by hand.
     *
     * The sync does this on completion and cron does it after the nightly price
     * capture, so this is for the case where prices or rows were changed some
     * other way and search is answering from the previous catalogue.
     */
    if (action === 'refresh-unique') {
      const { data, error } = await supabase.rpc('refresh_cards_unique');
      return new Response(JSON.stringify(error ? { error: error.message } : { message: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error ? 500 : 200,
      });
    }

    if (action === 'backfill-faces') {
      const result = await backfillFaces({
        onlyMissing: body.only_missing !== false,
        deadlineMs: typeof body.deadline_ms === 'number' ? body.deadline_ms : undefined,
      });

      return new Response(JSON.stringify({
        ...result,
        message: result.remaining
          ? `Backfilled ${result.updated} cards; time budget reached, call again to continue.`
          : `Backfill complete. ${result.updated} cards now carry their faces.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'sync' || action === 'resume') {
      // Check for resumable state
      const resumeState = await getSyncState();
      
      // Check if already running
      const { data: status } = await supabase
        .from('sync_status')
        .select('status, current_step, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      // If running, check how long ago (allow resume if stuck > 1 minute)
      if (status?.status === 'running') {
        const minutesAgo = (Date.now() - new Date(status.last_sync).getTime()) / 60000;
        // If recently updated AND no resume state, it's actively running
        if (minutesAgo < 1 && !resumeState) {
          return new Response(JSON.stringify({ 
            message: 'Sync already in progress',
            status: 'running'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409
          });
        }
        // If stuck (>1 min) or has resume state, allow to continue
        console.log(`⚠️ Sync was stuck for ${minutesAgo.toFixed(1)} mins. Resuming...`);
      }
      
      // For 'sync' action without resume state, start fresh. Otherwise resume.
      const useResume = action === 'resume' || (resumeState !== null && status?.status === 'running');
      
      // Run sync
      const result = await syncCards(useResume ? resumeState : undefined);
      
      // If needs resume, trigger continuation in background
      if (result.needsResume) {
        // Schedule continuation
        EdgeRuntime.waitUntil((async () => {
          // Small delay before triggering next batch
          await new Promise(r => setTimeout(r, 2000));
          console.log('🔄 Auto-triggering next batch...');
          try {
            await fetch(`${supabaseUrl}/functions/v1/scryfall-sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ action: 'resume' })
            });
          } catch (e) {
            console.error('Failed to trigger continuation:', e);
          }
        })());
      }
      
      return new Response(JSON.stringify({
        ...result,
        message: result.needsResume 
          ? `Processed ${result.processed} cards. Auto-continuing in background...`
          : result.success 
            ? `Sync complete! ${result.processed} cards synced.`
            : `Sync failed: ${result.error}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500
      });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
    
  } catch (error) {
    console.error('💥 Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
