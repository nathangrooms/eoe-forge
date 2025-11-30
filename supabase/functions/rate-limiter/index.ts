import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'api:general': { maxRequests: 100, windowMs: 60000 }, // 100 per minute
  'api:search': { maxRequests: 30, windowMs: 60000 }, // 30 per minute
  'api:auth': { maxRequests: 5, windowMs: 900000 }, // 5 per 15 minutes
  'api:deck-build': { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  'api:collection': { maxRequests: 50, windowMs: 60000 }, // 50 per minute
};

// Simple in-memory rate limit store (for production, use Redis or similar)
const rateLimitStore = new Map<string, Array<{ timestamp: number }>>();

function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  // Get existing requests
  let requests = rateLimitStore.get(key) || [];
  
  // Remove old requests outside the window
  requests = requests.filter(req => req.timestamp > windowStart);
  
  // Check if over limit
  const allowed = requests.length < config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - requests.length);
  const resetAt = requests.length > 0 
    ? requests[0].timestamp + config.windowMs 
    : now + config.windowMs;
  
  // Add current request if allowed
  if (allowed) {
    requests.push({ timestamp: now });
    rateLimitStore.set(key, requests);
  }
  
  return { allowed, remaining, resetAt };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { endpoint, userId } = await req.json();

    if (!endpoint || !userId) {
      return new Response(
        JSON.stringify({ error: 'endpoint and userId are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Determine rate limit config based on endpoint
    const configKey = Object.keys(RATE_LIMITS).find(key => 
      endpoint.includes(key.replace('api:', ''))
    ) || 'api:general';
    
    const config = RATE_LIMITS[configKey];
    const rateLimitKey = `${configKey}:${userId}`;
    
    const result = checkRateLimit(rateLimitKey, config);

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          resetAt: result.resetAt,
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
          },
          status: 429,
        }
      );
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining: result.remaining,
        resetAt: result.resetAt,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
        },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in rate-limiter function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});