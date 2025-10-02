# AI Optimization Implementation Plan

## Quick Wins (Deploy Now)

### 1. Optimize mtg-brain System Prompt
**File:** `supabase/functions/mtg-brain/index.ts`

**Current size:** 8,000+ tokens  
**Target size:** 500 tokens  
**Savings:** 7,500 tokens per call × 50 calls/day = 375,000 tokens/day

**Changes:**
```typescript
// Replace entire MTG_KNOWLEDGE serialization with condensed reference
const systemPrompt = `You are MTG Super Brain, the ultimate Magic: The Gathering expert.

### Core Expertise
**Colors:** W(life/protection/removal), U(draw/control/counter), B(removal/tutors/recursion), R(damage/haste/artifact-hate), G(ramp/creatures/enchantment-hate)

**Commander Essentials:** 36-40 lands, 10-14 ramp, 10-15 draw, 8-12 removal, 3-5 board wipes, clear win conditions

**Mana Curve:** Target 2.8-3.5 avg CMC. Curve peaks at 2-3 CMC for efficient gameplay.

**Archetypes:** Aggro, Midrange, Control, Combo, Tribal, Voltron, Tokens, Aristocrats, Stax, Reanimator

${deckContext ? `### Current Deck
- Name: ${deckContext.name}
- Format: ${deckContext.format}
- Commander: ${deckContext.commander?.name || 'None'}
- Power: ${deckContext.power?.score || '?'}/10
- Cards: ${deckContext.counts?.total || 0} (Lands: ${deckContext.counts?.lands || 0}, Creatures: ${deckContext.counts?.creatures || 0})
- Curve Bins: ${JSON.stringify(deckContext.curve?.bins || {})}
- Mana Sources: ${JSON.stringify(deckContext.mana?.sources || {})}

${onlyIncludeFullCardListIfUserAsksSpecifically ? 
  `**Card Names:** ${deckContext.cards?.map(c => c.name).join(', ').substring(0, 500)}...` 
  : ''}` 
: ''}

${cardContext}

### Response Guidelines
- ${responseStyle === 'detailed' ? 'Comprehensive analysis with tables/charts' : 'Quick, actionable advice'}
- **ALWAYS end with:** Referenced Cards: [semicolon-separated list of all cards mentioned]
- Use markdown tables for comparisons
- Use tool calls for charts (CMC, colors) when relevant`;
```

### 2. Reduce max_tokens
```typescript
const max_tokens = responseStyle === 'detailed' ? 1000 : 400; // Was 2000/600
```

### 3. Only Send Full Card List When Needed
```typescript
// Detect if user is asking for card-specific analysis
const needsFullCardList = /(card list|specific cards|which cards|card analysis|cut these|replace these)/i.test(message);

const deckContextSlim = {
  ...deckContext,
  cards: needsFullCardList ? deckContext.cards : undefined, // Exclude unless needed
  cardSummary: needsFullCardList ? undefined : `${deckContext.counts?.total || 0} cards in deck`
};
```

---

## Caching Strategy

### Implementation
```typescript
// In-memory cache (will reset on function cold start, but that's OK)
const responseCache = new Map<string, { data: any; timestamp: number; ttl: number }>();

function getCacheKey(deckId: string, message: string): string {
  // Normalize message to catch similar queries
  const normalized = message.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  return `${deckId || 'no-deck'}:${hashString(normalized)}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCached(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > entry.ttl) {
    responseCache.delete(key);
    return null;
  }
  
  return entry.data;
}

function setCache(key: string, data: any, ttl: number = 300000) { // 5 min default
  responseCache.set(key, { data, timestamp: Date.now(), ttl });
  
  // Keep cache size under control
  if (responseCache.size > 100) {
    const oldest = Array.from(responseCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    responseCache.delete(oldest[0]);
  }
}
```

### Usage in mtg-brain
```typescript
// Before calling AI
const cacheKey = getCacheKey(deckContext?.id, message);
const cached = getCached(cacheKey);

if (cached) {
  console.log('Cache hit! Returning cached response');
  return new Response(JSON.stringify(cached), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// After AI responds
const result = { message: assistantMessage, cards: cardData, visualData, success: true };
setCache(cacheKey, result);
```

---

## Model Selection Strategy

### Query Classification
```typescript
function classifyQuery(message: string): 'simple' | 'complex' | 'visual' {
  const lower = message.toLowerCase();
  
  // Simple queries (use flash-lite)
  if (/(what is|what does|how do|explain|rules|can i)/i.test(lower)) {
    return 'simple';
  }
  
  // Visual queries (use flash for tool calling)
  if (/(chart|graph|table|compare|analyze curve|distribution)/i.test(lower)) {
    return 'visual';
  }
  
  // Default to complex
  return 'complex';
}

function selectOptimalModel(queryType: string): string {
  switch (queryType) {
    case 'simple':
      return 'google/gemini-2.5-flash-lite'; // 50% cheaper
    case 'visual':
    case 'complex':
    default:
      return 'google/gemini-2.5-flash';
  }
}
```

---

## Expected Results

### Before Optimization
- Average session: 10 AI calls
- Average tokens per call: 12,600
- Total tokens per session: 126,000
- Estimated cost: $0.015/session

### After Optimization
- Average session: 10 AI calls (6 from cache)
- Average tokens per call: 2,100
- Total tokens per session: 21,000 (4 calls) + cache hits
- Estimated cost: $0.003/session

**Savings per 100 sessions: $1.20**

---

## Rollout Plan

1. **Day 1 (Today):**
   - Deploy optimized mtg-brain prompt
   - Add response caching
   - Reduce max_tokens limits
   - Monitor token usage logs

2. **Day 2:**
   - Build admin dashboard (metrics + controls)
   - Add prompt editor
   - Implement cache viewer

3. **Day 3:**
   - Smart model routing
   - Knowledge base editor
   - Rate limiting UI

4. **Day 4:**
   - A/B testing framework
   - Cost prediction dashboard
   - User feedback collection

5. **Day 5:**
   - Review metrics
   - Fine-tune based on data
   - Document final optimizations

---

## Success Metrics

### KPIs to Track:
1. **Token Reduction:** Target 70% reduction in first week
2. **Cache Hit Rate:** Target 40%+ by week 2
3. **Response Quality:** Maintain or improve user satisfaction
4. **Latency:** Keep under 2 seconds avg
5. **Error Rate:** <1% on AI calls

### Weekly Review:
- Compare token usage week-over-week
- Analyze most expensive queries
- Identify new optimization opportunities
- Gather user feedback on AI quality

---

**Status:** READY FOR IMPLEMENTATION  
**Owner:** Development Team  
**Timeline:** 5 days for full rollout
