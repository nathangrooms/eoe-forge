import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GITHUB_API_BASE = 'https://api.github.com/repos/Westly/CommanderPrecons/contents';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Westly/CommanderPrecons/main';

interface PreconFile {
  name: string;
  download_url: string;
}

interface PreconListItem {
  id: string;
  name: string;
  set: string;
  filename: string;
}

// Parse deck name and set from filename like "Abzan Armor (Tarkir Dragonstorm Commander Precon Decklist).json"
function parseFilename(filename: string): { name: string; set: string } | null {
  const match = filename.match(/^(.+?)\s*\((.+?)\s*(?:Commander\s*)?(?:Precon\s*)?(?:Decklist)?\)\.json$/i);
  if (match) {
    return {
      name: match[1].trim(),
      set: match[2].trim()
    };
  }
  // Fallback: just use the filename without extension
  return {
    name: filename.replace('.json', ''),
    set: 'Unknown'
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';
    const deckName = url.searchParams.get('deck');

    console.log(`[fetch-precons] Action: ${action}, Deck: ${deckName}`);

    if (action === 'list') {
      // Fetch list of all precon JSON files
      const response = await fetch(`${GITHUB_API_BASE}/precon_json`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DeckMatrix-App'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const files: PreconFile[] = await response.json();
      
      // Parse each file to extract deck name and set
      const precons: PreconListItem[] = files
        .filter(f => f.name.endsWith('.json'))
        .map(f => {
          const parsed = parseFilename(f.name);
          return {
            id: f.name.replace('.json', ''),
            name: parsed?.name || f.name.replace('.json', ''),
            set: parsed?.set || 'Unknown',
            filename: f.name
          };
        })
        .sort((a, b) => a.set.localeCompare(b.set) || a.name.localeCompare(b.name));

      // Group by set for easier browsing
      const bySet: Record<string, PreconListItem[]> = {};
      for (const precon of precons) {
        if (!bySet[precon.set]) {
          bySet[precon.set] = [];
        }
        bySet[precon.set].push(precon);
      }

      console.log(`[fetch-precons] Found ${precons.length} precons in ${Object.keys(bySet).length} sets`);

      return new Response(
        JSON.stringify({ precons, bySet, total: precons.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get' && deckName) {
      // Fetch specific precon deck
      const encodedName = encodeURIComponent(deckName);
      const deckUrl = `${GITHUB_RAW_BASE}/precon_json/${encodedName}.json`;
      
      console.log(`[fetch-precons] Fetching deck from: ${deckUrl}`);
      
      const response = await fetch(deckUrl, {
        headers: {
          'User-Agent': 'DeckMatrix-App'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch precon: ${response.status} ${response.statusText}`);
      }

      const deckData = await response.json();
      
      // Extract relevant card data from Moxfield format
      // Moxfield JSON structure has mainboard, commanders, etc.
      const cards: Array<{
        quantity: number;
        card_name: string;
        scryfall_id: string;
        is_commander: boolean;
      }> = [];

      // Process mainboard
      if (deckData.mainboard) {
        for (const [cardName, cardData] of Object.entries(deckData.mainboard)) {
          const data = cardData as any;
          cards.push({
            quantity: data.quantity || 1,
            card_name: data.card?.name || cardName,
            scryfall_id: data.card?.scryfall_id || '',
            is_commander: false
          });
        }
      }

      // Process commanders
      if (deckData.commanders) {
        for (const [cardName, cardData] of Object.entries(deckData.commanders)) {
          const data = cardData as any;
          cards.push({
            quantity: data.quantity || 1,
            card_name: data.card?.name || cardName,
            scryfall_id: data.card?.scryfall_id || '',
            is_commander: true
          });
        }
      }

      // Process sideboard if exists
      if (deckData.sideboard) {
        for (const [cardName, cardData] of Object.entries(deckData.sideboard)) {
          const data = cardData as any;
          cards.push({
            quantity: data.quantity || 1,
            card_name: data.card?.name || cardName,
            scryfall_id: data.card?.scryfall_id || '',
            is_commander: false
          });
        }
      }

      const parsed = parseFilename(deckName + '.json');
      
      const result = {
        name: parsed?.name || deckName,
        set: parsed?.set || 'Unknown',
        format: 'commander',
        cards,
        totalCards: cards.reduce((sum, c) => sum + c.quantity, 0),
        raw: deckData // Include raw data for debugging
      };

      console.log(`[fetch-precons] Deck ${parsed?.name} has ${cards.length} unique cards, ${result.totalCards} total`);

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action or missing parameters' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fetch-precons] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
