import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Gemini Flash for fast, accurate card recognition
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a Magic: The Gathering card recognition expert. Your job is to identify the card name from images of MTG cards.

INSTRUCTIONS:
1. Look at the image and identify the card name at the top of the card
2. Return ONLY the exact card name, nothing else
3. If you cannot identify a card name, return "UNRECOGNIZED"
4. Be precise - card names must match exactly for database lookup
5. Handle both English and foreign language cards (translate to English name)
6. Ignore set symbols, mana costs, or other text - only the card name matters

EXAMPLES:
- If you see "Sol Ring" on the card, respond: Sol Ring
- If you see "Lightning Bolt" on the card, respond: Lightning Bolt
- If you see a blurry or unclear image, respond: UNRECOGNIZED`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "What is the name of this Magic: The Gathering card? Return ONLY the card name."
              },
              {
                type: "image_url",
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        max_tokens: 100,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("AI recognition failed");
    }

    const data = await response.json();
    const cardName = data.choices?.[0]?.message?.content?.trim();

    if (!cardName || cardName === "UNRECOGNIZED" || cardName.length < 2) {
      return new Response(
        JSON.stringify({ cardName: null, message: "Could not recognize card" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean up the response - remove quotes, extra punctuation
    const cleanedName = cardName
      .replace(/^["']|["']$/g, '')
      .replace(/\.$/, '')
      .trim();

    console.log("Recognized card:", cleanedName);

    return new Response(
      JSON.stringify({ cardName: cleanedName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Scan error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process image" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
