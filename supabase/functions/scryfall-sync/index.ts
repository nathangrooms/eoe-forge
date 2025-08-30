import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
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
  prices?: Record<string, string>;
  rarity: string;
  reserved?: boolean;
  faces?: any[];
}

async function updateSyncStatus(id: string, status: string, error?: string, processed?: number, total?: number) {
  console.log(`📊 Updating sync status: ${status}, processed: ${processed}, total: ${total}, error: ${error}`);
  
  try {
    const updateData: any = { 
      status, 
      last_sync: new Date().toISOString() 
    };
    
    if (error) updateData.error_message = error;
    if (processed !== undefined) updateData.records_processed = processed;
    if (total !== undefined) updateData.total_records = total;

    // Use upsert to handle both insert and update cases
    const { error: updateError } = await supabase
      .from('sync_status')
      .upsert({
        id,
        ...updateData
      }, { 
        onConflict: 'id'
      });

    if (updateError) {
      console.error('❌ Failed to update sync status:', updateError);
      console.error('Update data was:', { id, ...updateData });
    } else {
      console.log('✅ Sync status updated successfully');
    }
  } catch (err) {
    console.error('💥 Exception updating sync status:', err);
  }
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * (i + 1);
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${i + 1}`);
        await delay(waitTime);
        continue;
      }
      
      if (response.ok) {
        return response;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1));
    }
  }
  
  throw new Error('Max retries exceeded');
}

function tagCard(card: ScryfallCard): string[] {
  const tags: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = card.type_line.toLowerCase();
  
  // Basic type tags
  if (typeLine.includes('land')) tags.push('land');
  if (typeLine.includes('creature')) tags.push('creature');
  if (typeLine.includes('instant')) tags.push('instant');
  if (typeLine.includes('sorcery')) tags.push('sorcery');
  if (typeLine.includes('artifact')) tags.push('artifact');
  if (typeLine.includes('enchantment')) tags.push('enchantment');
  if (typeLine.includes('planeswalker')) tags.push('planeswalker');
  
  // Role tags
  if (text.includes('add') && text.includes('mana')) tags.push('ramp');
  if (text.includes('destroy') || text.includes('exile')) tags.push('removal');
  if (text.includes('counter target') && typeLine.includes('instant')) tags.push('counterspell');
  if (text.includes('draw') && text.includes('card')) tags.push('draw');
  if (text.includes('search') && text.includes('library')) tags.push('tutor');
  if (text.includes('return') && text.includes('graveyard')) tags.push('recursion');
  if (text.includes('hexproof') || text.includes('indestructible') || text.includes('protection')) tags.push('protection');
  
  // Synergy tags
  if (text.includes('token')) tags.push('tokens');
  if (text.includes('sacrifice')) tags.push('sacrifice');
  if (text.includes('enters the battlefield') || text.includes('enter the battlefield')) tags.push('etb');
  if (text.includes('equipment')) tags.push('equipment');
  if (text.includes('aura')) tags.push('auras');
  if (text.includes('landfall')) tags.push('landfall');
  if (text.includes('storm')) tags.push('storm');
  if (text.includes('energy')) tags.push('energy');
  
  // Win condition detection
  if (text.includes('wins the game') || text.includes('lose the game')) tags.push('wincon');
  if (text.includes('infinite') || (text.includes('copy') && text.includes('spell'))) tags.push('combo-piece');
  
  // Fast mana
  if ((card.cmc <= 2 && tags.includes('ramp')) || 
      (typeLine.includes('artifact') && text.includes('add') && card.cmc <= 2)) {
    tags.push('fast-mana');
  }
  
  return tags;
}

async function syncCards(): Promise<void> {
  console.log('🚀 Starting incremental Scryfall card sync...');
  
  try {
    console.log('📝 Updating initial sync status...');
    await updateSyncStatus('scryfall_cards', 'running', null, 0, 5000);
    console.log('✅ Initial status update complete');
    
    // Instead of bulk download, use search API with pagination
    let totalProcessed = 0;
    const batchSize = 175; // Scryfall's max per page
    const maxPages = 28; // Process ~5000 cards total (175 * 28)
    
    console.log(`🔄 Processing ${maxPages} pages of ${batchSize} cards each`);
    
    for (let page = 1; page <= maxPages; page++) {
      console.log(`📄 Processing page ${page}/${maxPages}...`);
      
      try {
        // Fetch cards using search API with pagination
        const searchUrl = `https://api.scryfall.com/cards/search?q=*&page=${page}&order=name`;
        const response = await fetchWithRetry(searchUrl);
        
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`📄 No more pages at page ${page}, stopping`);
            break;
          }
          throw new Error(`Search API failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📦 Retrieved ${data.data?.length || 0} cards from page ${page}`);
        
        if (!data.data || data.data.length === 0) {
          console.log(`📄 Empty page ${page}, stopping`);
          break;
        }
        
        // Process cards from this page
        const cards = data.data
          .filter((card: any) => !card.type_line.toLowerCase().includes('token'))
          .map((card: any) => ({
            id: card.id,
            oracle_id: card.oracle_id,
            name: card.name,
            set_code: card.set,
            collector_number: card.collector_number,
            layout: card.layout || 'normal',
            type_line: card.type_line,
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
            image_uris: card.image_uris || {},
            prices: card.prices || {},
            is_legendary: card.type_line.toLowerCase().includes('legendary'),
            is_reserved: card.reserved || false,
            rarity: card.rarity || 'common',
            tags: tagCard(card)
          }));
        
        if (cards.length > 0) {
          console.log(`💾 Saving ${cards.length} cards from page ${page}...`);
          
          const { error: insertError } = await supabase
            .from('cards')
            .upsert(cards, { onConflict: 'id' });
          
          if (insertError) {
            console.error('Insert failed:', insertError);
            throw insertError;
          }
          
          totalProcessed += cards.length;
          console.log(`✅ Page ${page} saved: ${cards.length} cards (total: ${totalProcessed})`);
          
          // Update progress after each page
          await updateSyncStatus('scryfall_cards', 'running', null, totalProcessed, 5000);
        }
        
        // Small delay between pages to be respectful to Scryfall API
        await delay(100);
        
      } catch (pageError) {
        console.error(`❌ Failed to process page ${page}:`, pageError);
        // Continue with next page instead of failing completely
        continue;
      }
    }
    
    console.log(`✅ Incremental sync completed: ${totalProcessed} cards processed`);
    await updateSyncStatus('scryfall_cards', 'completed', null, totalProcessed, totalProcessed);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    await updateSyncStatus('scryfall_cards', 'failed', error.message);
    throw error;
  }
}

async function processBatch(cards: any[], totalProcessed: number): Promise<void> {
  if (cards.length === 0) return;
  
  const { error } = await supabase
    .from('cards')
    .upsert(cards, { onConflict: 'id' });
  
  if (error) {
    console.error('Batch upsert error:', error);
    throw error;
  }
  
  console.log(`💾 Saved batch of ${cards.length} cards (total processed: ${totalProcessed})`);
}

serve(async (req) => {
  console.log('🌟 Edge function invoked:', new Date().toISOString());
  console.log('📥 Request method:', req.method);
  console.log('🔗 Request URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json().catch(() => ({ action: 'sync' }));
    console.log('📋 Request body:', JSON.stringify(requestBody));
    const { action } = requestBody;
    
    if (action === 'sync') {
      console.log('🔄 Sync action requested');
      
      // Check if sync is already running
      const { data: existingSync, error: fetchError } = await supabase
        .from('sync_status')
        .select('status, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      if (fetchError) {
        console.error('❌ Failed to fetch sync status:', fetchError);
        throw fetchError;
      }
      
      console.log('📊 Current sync status:', existingSync);
      
      if (existingSync?.status === 'running') {
        // Check if it's been running for more than 30 minutes (likely stuck)
        const lastSync = new Date(existingSync.last_sync);
        const now = new Date();
        const minutesSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60);
        
        console.log('⏰ Minutes since last sync:', minutesSinceLastSync);
        
        if (minutesSinceLastSync < 30) {
          console.log('⚠️ Sync already running, rejecting request');
          return new Response(
            JSON.stringify({ 
              message: 'Sync already running', 
              status: existingSync.status,
              lastSync: existingSync.last_sync 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409 
            }
          );
        } else {
          console.log('🔄 Resetting stuck sync status');
          await updateSyncStatus('scryfall_cards', 'failed', 'Sync timeout - automatically reset');
        }
      }
      
      console.log('🚀 Starting background sync task');
      
      // Execute sync immediately instead of background task for debugging
      try {
        await syncCards();
        console.log('✅ Sync completed successfully');
        return new Response(
          JSON.stringify({ 
            message: 'Card sync completed successfully', 
            timestamp: new Date().toISOString(),
            status: 'completed'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      } catch (syncError) {
        console.error('💥 Sync failed:', syncError);
        await updateSyncStatus('scryfall_cards', 'failed', `Sync error: ${syncError.message}`);
        
        return new Response(
          JSON.stringify({ 
            error: syncError.message,
            timestamp: new Date().toISOString()
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }
    }
    
    if (action === 'stop') {
      console.log('🛑 Stop sync requested');
      
      await updateSyncStatus('scryfall_cards', 'failed', 'Manually stopped by user');
      
      console.log('✅ Sync stopped successfully');
      return new Response(
        JSON.stringify({ 
          message: 'Sync stopped', 
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    if (action === 'status') {
      console.log('📊 Status check requested');
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      if (error) {
        console.error('❌ Status fetch error:', error);
        throw error;
      }
      
      console.log('✅ Status retrieved:', data);
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('❌ Invalid action received:', action);
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
    
  } catch (error) {
    console.error('💥 Edge function error:', error);
    console.error('📋 Error stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});