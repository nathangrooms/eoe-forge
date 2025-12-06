import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL is from Scryfall
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('scryfall.io') && !parsedUrl.hostname.includes('scryfall.com')) {
      return new Response(
        JSON.stringify({ error: 'Only Scryfall URLs are allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the image
    const imageResponse = await fetch(url);
    
    if (!imageResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch image' }),
        { status: imageResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get image as array buffer and convert to base64
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${contentType};base64,${base64}`;

    return new Response(
      JSON.stringify({ dataUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Proxy image error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
