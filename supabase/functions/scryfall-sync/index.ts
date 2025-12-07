import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'MTGDeckBuilder/1.0 (contact@example.com)';
const BATCH_SIZE = 500; // Larger batches for faster inserts

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

async function updateSyncStatus(
  status: string, 
  processed?: number, 
  total?: number, 
  step?: string, 
  error?: string
) {
  const updateData: Record<string, any> = { 
    status, 
    last_sync: new Date().toISOString() 
  };
  
  if (processed !== undefined) updateData.records_processed = processed;
  if (total !== undefined) updateData.total_records = total;
  if (step) updateData.current_step = step;
  if (error) updateData.error_message = error;
  else updateData.error_message = null;

  await supabase.from('sync_status').upsert({ id: 'scryfall_cards', ...updateData }, { onConflict: 'id' });
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
  if (text.includes('counter target') && typeLine.includes('instant')) tags.push('counterspell');
  if (text.includes('draw') && text.includes('card')) tags.push('draw');
  if (text.includes('search') && text.includes('library')) tags.push('tutor');
  if (text.includes('token')) tags.push('tokens');
  if (text.includes('sacrifice')) tags.push('sacrifice');
  
  return tags;
}

function getImageUris(card: ScryfallCard): Record<string, string> {
  // For single-faced cards
  if (card.image_uris) {
    return card.image_uris;
  }
  // For double-faced cards, use front face
  if (card.card_faces && card.card_faces[0]?.image_uris) {
    return card.card_faces[0].image_uris;
  }
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

async function syncCards(): Promise<{ success: boolean; processed: number; error?: string }> {
  console.log('🚀 Starting bulk data sync from Scryfall...');
  
  try {
    await updateSyncStatus('running', 0, 0, 'fetching_bulk_info');
    
    // Step 1: Get bulk data download URL
    console.log('📡 Fetching bulk data info...');
    const bulkResponse = await fetch('https://api.scryfall.com/bulk-data', {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!bulkResponse.ok) {
      throw new Error(`Failed to fetch bulk data info: ${bulkResponse.status}`);
    }
    
    const bulkData = await bulkResponse.json();
    const defaultCards = bulkData.data.find((item: any) => item.type === 'default_cards');
    
    if (!defaultCards) {
      throw new Error('Could not find default_cards bulk data');
    }
    
    console.log(`📦 Bulk data: ${defaultCards.name}, Size: ${Math.round(defaultCards.size / 1024 / 1024)}MB`);
    await updateSyncStatus('running', 0, 0, 'downloading');
    
    // Step 2: Download the bulk data file
    console.log('⬇️ Downloading bulk data file...');
    const downloadResponse = await fetch(defaultCards.download_uri, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download bulk data: ${downloadResponse.status}`);
    }
    
    const allCards: ScryfallCard[] = await downloadResponse.json();
    console.log(`📊 Downloaded ${allCards.length} total cards`);
    
    // Step 3: Filter to paper cards only (exclude digital-only)
    const paperCards = allCards.filter(card => 
      card.games?.includes('paper') && 
      card.type_line && 
      !card.type_line.includes('Token')
    );
    
    console.log(`🎴 Filtered to ${paperCards.length} paper cards`);
    await updateSyncStatus('running', 0, paperCards.length, 'processing');
    
    // Step 4: Process in batches
    let processed = 0;
    let errors = 0;
    
    for (let i = 0; i < paperCards.length; i += BATCH_SIZE) {
      const batch = paperCards.slice(i, i + BATCH_SIZE);
      const transformedBatch = batch.map(transformCard);
      
      const { error } = await supabase
        .from('cards')
        .upsert(transformedBatch, { onConflict: 'id', ignoreDuplicates: false });
      
      if (error) {
        console.error(`❌ Batch error at ${i}:`, error.message);
        errors++;
        if (errors > 10) {
          throw new Error(`Too many batch errors: ${error.message}`);
        }
        continue;
      }
      
      processed += batch.length;
      
      // Update progress every 5000 cards
      if (processed % 5000 < BATCH_SIZE) {
        const pct = ((processed / paperCards.length) * 100).toFixed(1);
        console.log(`📊 Progress: ${processed}/${paperCards.length} (${pct}%)`);
        await updateSyncStatus('running', processed, paperCards.length, 'processing');
      }
    }
    
    console.log(`✅ Sync complete! Processed ${processed} cards`);
    await updateSyncStatus('completed', processed, processed, 'complete');
    
    return { success: true, processed };
    
  } catch (error) {
    const message = (error as Error).message;
    console.error('💥 Sync failed:', message);
    await updateSyncStatus('failed', 0, 0, 'error', message);
    return { success: false, processed: 0, error: message };
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
    } catch {
      // Default to sync
    }
    
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
      await updateSyncStatus('stopped', undefined, undefined, 'stopped', 'Manually stopped');
      return new Response(JSON.stringify({ message: 'Sync stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'sync') {
      // Check if already running
      const { data: status } = await supabase
        .from('sync_status')
        .select('status, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      if (status?.status === 'running') {
        const lastSync = new Date(status.last_sync);
        const minutesAgo = (Date.now() - lastSync.getTime()) / 60000;
        
        if (minutesAgo < 5) {
          return new Response(JSON.stringify({ 
            message: 'Sync already in progress',
            status: 'running'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409
          });
        }
        // Reset stuck sync
        console.log('🔧 Resetting stuck sync...');
      }
      
      // Use EdgeRuntime.waitUntil for background processing
      const syncPromise = syncCards();
      
      // Check if EdgeRuntime is available (Supabase edge runtime)
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(syncPromise);
        return new Response(JSON.stringify({ 
          message: 'Sync started in background',
          status: 'started'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // Fallback: run sync and wait for completion
        const result = await syncPromise;
        return new Response(JSON.stringify({ 
          message: result.success ? 'Sync completed' : 'Sync failed',
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500
        });
      }
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
