import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'MTGDeckBuilder/1.0';
const RATE_LIMIT_DELAY = 100; // 100ms between requests
const BATCH_SIZE = 175;
const MAX_PAGES_PER_RUN = 100; // Increased from 50 to process more per run

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  card_faces?: Array<{ image_uris?: Record<string, string> }>;
  prices?: Record<string, string>;
  rarity: string;
  reserved?: boolean;
  games?: string[];
}

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
  error?: string
) {
  const updateData: Record<string, any> = { 
    status, 
    last_sync: new Date().toISOString() 
  };
  
  if (processed !== undefined) updateData.records_processed = processed;
  if (total !== undefined) updateData.total_records = total;
  if (step) updateData.current_step = step;
  if (stepProgress !== undefined) updateData.step_progress = stepProgress;
  if (error) updateData.error_message = error;
  else updateData.error_message = null;

  await supabase.from('sync_status').upsert({ id: 'scryfall_cards', ...updateData }, { onConflict: 'id' });
}

async function getSyncState(): Promise<SyncState | null> {
  const { data } = await supabase
    .from('sync_status')
    .select('*')
    .eq('id', 'scryfall_cards')
    .maybeSingle();
  
  if (data?.current_step === 'resumable' && data?.error_message) {
    try {
      return JSON.parse(data.error_message) as SyncState;
    } catch { return null; }
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

function tagCard(card: ScryfallCard): string[] {
  const tags: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  
  if (typeLine.includes('land')) tags.push('land');
  if (typeLine.includes('creature')) tags.push('creature');
  if (typeLine.includes('instant')) tags.push('instant');
  if (typeLine.includes('sorcery')) tags.push('sorcery');
  if (typeLine.includes('artifact')) tags.push('artifact');
  if (typeLine.includes('enchantment')) tags.push('enchantment');
  if (typeLine.includes('planeswalker')) tags.push('planeswalker');
  
  if (text.includes('add') && text.includes('mana')) tags.push('ramp');
  if (text.includes('destroy') || text.includes('exile')) tags.push('removal');
  if (text.includes('draw') && text.includes('card')) tags.push('draw');
  if (text.includes('search') && text.includes('library')) tags.push('tutor');
  if (text.includes('token')) tags.push('tokens');
  
  return tags;
}

function getImageUris(card: ScryfallCard): Record<string, string> {
  if (card.image_uris) return card.image_uris;
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris;
  return {};
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
    prices: card.prices || {},
    is_legendary: (card.type_line || '').toLowerCase().includes('legendary'),
    is_reserved: card.reserved || false,
    rarity: card.rarity || 'common',
    tags: tagCard(card),
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

// Self-invoking function to continue sync
async function triggerContinuation() {
  try {
    console.log('🔄 Triggering auto-continuation...');
    // Call ourselves to continue the sync
    const response = await fetch(`${supabaseUrl}/functions/v1/scryfall-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ action: 'resume' })
    });
    console.log('✅ Auto-continuation triggered, status:', response.status);
  } catch (error) {
    console.error('❌ Failed to trigger continuation:', error);
  }
}

async function syncCards(resumeState?: SyncState): Promise<{ success: boolean; processed: number; needsResume: boolean; error?: string }> {
  console.log('🚀 Starting card sync from Scryfall...');
  
  try {
    let totalProcessed = resumeState?.total_processed || 0;
    let currentPage = resumeState?.current_page || 1;
    let estimatedTotal = resumeState?.total_cards || 0;
    let pagesProcessedThisRun = 0;
    
    // Start URL
    let currentUrl: string | null = resumeState?.next_page_url || 
      'https://api.scryfall.com/cards/search?q=-is%3Adigital+game%3Apaper&unique=cards&page=1';
    
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
            const { error } = await supabase
              .from('cards')
              .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });
            
            if (error) {
              console.error(`❌ DB error on page ${currentPage}:`, error.message);
              await saveSyncState({
                next_page_url: currentUrl,
                total_processed: totalProcessed,
                total_cards: estimatedTotal,
                current_page: currentPage
              });
              throw new Error(`DB error: ${error.message}`);
            }
          }
          
          totalProcessed += transformed.length;
          console.log(`✅ Page ${currentPage}: saved ${transformed.length} cards (total: ${totalProcessed})`);
        }
        
        // Update progress every 10 pages to reduce DB writes
        if (currentPage % 10 === 0) {
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
      console.log(`⏸️ Pausing sync - processed ${pagesProcessedThisRun} pages this run`);
      await saveSyncState({
        next_page_url: currentUrl,
        total_processed: totalProcessed,
        total_cards: estimatedTotal,
        current_page: currentPage
      });
      
      // Auto-trigger continuation using EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil(triggerContinuation());
      
      return { success: true, processed: totalProcessed, needsResume: true };
    }
    
    console.log(`🎉 Sync complete! Total: ${totalProcessed} cards`);
    await updateSyncStatus('completed', totalProcessed, totalProcessed, 'complete', currentPage);
    return { success: true, processed: totalProcessed, needsResume: false };
    
  } catch (error) {
    const message = (error as Error).message;
    console.error('💥 Sync failed:', message);
    return { success: false, processed: 0, needsResume: false, error: message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let action = 'sync';
    try {
      const body = await req.json();
      action = body.action || 'sync';
    } catch { /* default to sync */ }
    
    if (action === 'status') {
      const { data } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      // If resumable, show as still running
      if (data?.current_step === 'resumable') {
        return new Response(JSON.stringify({
          ...data,
          status: 'running',
          current_step: 'processing (auto-resuming)'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
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
    
    if (action === 'sync' || action === 'resume') {
      // Check for resumable state
      const resumeState = await getSyncState();
      
      // Check if already running (not resumable)
      const { data: status } = await supabase
        .from('sync_status')
        .select('status, current_step, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      // If it's running but NOT resumable, check if stuck (more than 5 minutes)
      if (status?.status === 'running' && status?.current_step !== 'resumable') {
        const minutesAgo = (Date.now() - new Date(status.last_sync).getTime()) / 60000;
        if (minutesAgo < 5) {
          return new Response(JSON.stringify({ 
            message: 'Sync already in progress',
            status: 'running'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409
          });
        }
      }
      
      // For resume action, always use existing state if available
      const useResume = action === 'resume' || (action === 'sync' && resumeState);
      const result = await syncCards(useResume ? resumeState || undefined : undefined);
      
      return new Response(JSON.stringify({
        ...result,
        message: result.needsResume 
          ? `Processed ${result.processed} cards. Auto-continuing...`
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
