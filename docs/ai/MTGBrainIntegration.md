# MTG Brain AI Integration - Complete Enhancement Guide

## Overview
The app now features comprehensive AI-powered assistance across all major pages using the MTG Brain edge function. Every feature leverages Lovable AI (Google Gemini 2.5 Flash) for intelligent analysis and recommendations.

---

## 🎯 AI Features by Page

### 1. **Dashboard** (`/`)
**Component:** `AIDeckRecommendations.tsx`

**Features:**
- Analyzes user's deck portfolio (gaps, overlaps, power spread)
- Recommends 3-5 new deck archetypes based on collection
- Suggests ways to diversify playstyle and color identity
- Identifies commanders that synergize with existing collection
- Provides strategic improvements for existing decks

**Prompting Strategy:**
- Detailed response style
- Includes deck summaries with format, colors, and power level
- Analyzes collection stats (total cards, color distribution)

---

### 2. **Collection** (`/collection`)
**Component:** `AICollectionInsights.tsx`

**Features:**
- Analyzes collection strengths and color identity
- Identifies deck-building potential and supported archetypes
- Highlights notable cards and value pieces
- Detects gaps or weaknesses to address
- Provides 3-5 specific card recommendations to enhance collection

**Prompting Strategy:**
- Detailed response style
- Includes top 10 cards with pricing
- Provides color and rarity distribution
- Focuses on actionable strategic insights

---

### 3. **Wishlist** (`/wishlist`)
**Component:** `AIWishlistSuggestions.tsx`

**Features:**
- Strategic purchasing order based on impact and synergy
- Budget-friendly alternatives for expensive cards
- Missing staples that should be added to wishlist
- Cards that pair well with current wishlist items
- 5-7 specific card recommendations with reasoning

**Prompting Strategy:**
- Detailed response style
- Prioritizes medium/high priority cards
- Focuses on strategic purchasing decisions
- Ends with "Referenced Cards: [list all cards mentioned]"

---

### 4. **Deck Builder** (`/deck-builder`)
**Component:** `AIDeckCoach.tsx`

**Features:**
- Overall deck strategy and win conditions analysis
- Key strengths and potential weaknesses
- Mana curve and consistency improvements
- 3-5 specific card recommendations with explanations
- Power level assessment and adjustment suggestions

**Prompting Strategy:**
- Detailed response style
- Includes complete decklist with card names
- Analyzes type distribution (creatures, instants, etc.)
- Commander-specific insights for EDH decks
- References format and power level

---

### 5. **Deck Manager** (`/decks`)
**Enhancement:** Existing page - AI features coming from integrated DeckBuilder
**Note:** Uses DeckAPI and compute_deck_summary for live metrics

---

### 6. **Marketplace** (`/marketplace`)
**Component:** `AIPricingInsights.tsx`

**Features:**
- Market trends for listed cards
- Pricing optimization recommendations
- Identifies cards likely to sell fastest
- Detects under/overpriced cards
- Strategic selling advice

**Prompting Strategy:**
- Concise response style (faster for marketplace decisions)
- Includes listing summaries with condition, foil status, and pricing
- Calculates total value and average price per listing
- Market-focused actionable insights

---

### 7. **Templates** (`/templates`)
**Component:** `AITemplateRecommendations.tsx`

**Features:**
- 5-7 specific deck template recommendations
- Explains why each template fits playstyle/collection
- Power level range for each archetype
- Key cards that define each template
- Learning curve and complexity for each template

**Prompting Strategy:**
- Detailed response style
- Considers selected format preference
- Analyzes user's existing decks for diversity suggestions
- Ends with "Referenced Cards: [list commanders and key cards mentioned]"

---

### 8. **Scan** (`/scan`)
**Component:** `AIScanHelper.tsx`

**Features:**
- Highlights notable cards in scanned batch (rarity, value, playability)
- Identifies potential deck archetypes cards support
- Finds cards that synergize well together
- Recommends what to scan/acquire next
- Highlights value cards and hidden gems

**Prompting Strategy:**
- Concise response style (quick feedback during scanning)
- Analyzes last 20 scanned cards
- Includes set codes and pricing information
- Calculates total scanned value

---

### 9. **Cards Search** (`/cards`)
**Component:** `AICardInsights.tsx` (available in card modals)

**Features:**
- Strategic value and power level assessment
- Best Commander archetypes and decks for the card
- Synergy opportunities and combo potential
- Meta relevance and competitive viability
- Budget alternatives or similar cards

**Prompting Strategy:**
- Concise response style
- Includes card type, mana cost, oracle text, colors
- Focuses on strategic analysis
- Ends with "Referenced Cards: [list cards mentioned]"

---

### 10. **Brain** (`/brain`)
**Component:** Full AI chat interface with MTG Brain

**Features:**
- Comprehensive deck analysis with deck context
- Visual data generation (charts, tables)
- Card recommendations with Scryfall integration
- Conversation history for context
- Quick action prompts (Analyze, Upgrades, Combos, Meta, Cuts, Strategy)
- Detailed vs Quick response toggle

**Prompting Strategy:**
- User-driven prompts with context enrichment
- Includes complete deck card list
- Conversation history (last 6 messages)
- Deck context (name, format, colors, power level, commander)

---

## 🎨 Design Patterns

### Consistent UI Components
All AI features share:
- **Gradient cosmic button**: `bg-gradient-cosmic hover:opacity-90`
- **Brain icon**: Rounded cosmic gradient background with shadow
- **Response display**: Border-left accent with spacecraft colors
- **AI badge**: Small rounded badge with "AI" or "DM" text
- **Loading state**: Spinner with descriptive text
- **Error handling**: Destructive background with alert icon

### Color System
- Primary accent: `border-spacecraft/50`, `bg-spacecraft/5`
- Cosmic gradient: `bg-gradient-cosmic`, `shadow-cosmic-glow`
- Text accents: `text-spacecraft`, `text-primary-foreground`

### Response Format
All AI responses use:
```tsx
<ReactMarkdown>{aiResponse}</ReactMarkdown>
```
With custom styling for markdown elements.

---

## 📊 MTG Brain Edge Function

### Location
`supabase/functions/mtg-brain/index.ts`

### Key Features
1. **Card Detection**: Extracts card names from AI responses
2. **Scryfall Integration**: Fetches card data for referenced cards
3. **Response Styles**: 'detailed' or 'concise'
4. **Deck Context**: Optional deck information for better analysis
5. **Conversation History**: Maintains context across messages

### Request Format
```typescript
{
  message: string,
  deckContext?: DeckSummary,
  conversationHistory?: Message[],
  responseStyle?: 'detailed' | 'concise'
}
```

### Response Format
```typescript
{
  text: string,        // AI response
  cards: CardData[],   // Referenced cards with Scryfall data
  visualData?: {       // Optional charts/tables
    charts: Chart[],
    tables: Table[]
  }
}
```

---

## 🔧 Implementation Best Practices

### 1. Error Handling
Always handle rate limits and payment errors:
```typescript
try {
  const { data, error } = await supabase.functions.invoke('mtg-brain', { body });
  if (error) throw error;
} catch (err) {
  const errMsg = (err instanceof Error ? err.message : String(err));
  if (errMsg.toLowerCase().includes('rate') || errMsg.includes('429')) {
    setError('Rate limits exceeded. Please wait before asking again.');
  } else if (errMsg.includes('payment') || errMsg.includes('402')) {
    setError('Credits required. Please add AI credits to continue.');
  }
}
```

### 2. Loading States
Provide clear feedback:
```tsx
{loading && (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="ml-3 text-muted-foreground">Analyzing...</span>
  </div>
)}
```

### 3. Conditional Rendering
Only show AI features when data is available:
```tsx
{userDecks.length > 0 && (
  <AIDeckRecommendations userDecks={userDecks} />
)}
```

---

## 🚀 Future Enhancements

### Potential Additions
1. **AI-Powered Price Tracking**: Alert users to price spikes/drops
2. **Meta Analysis**: Compare deck against current meta decks
3. **Combo Finder**: Identify infinite combos in collection
4. **Budget Optimizer**: Suggest budget upgrades for any deck
5. **Tournament Prep**: AI-generated sideboard guides
6. **Trade Finder**: Match collection surplus with wishlist needs

### Integration Opportunities
- Streaming responses for real-time analysis
- Image analysis for card condition assessment
- Voice input for hands-free deck building
- Multi-deck comparison and optimization

---

## 📝 Maintenance Notes

### Model Configuration
- Current model: `google/gemini-2.5-flash` (default)
- Free usage period: Until Oct 6, 2025
- Fallback models: `google/gemini-2.5-pro` for complex analysis

### Rate Limits
- Monitor edge function logs for 429 errors
- Implement client-side debouncing (already done in Brain)
- Cache responses where appropriate

### Prompt Engineering
All prompts follow this pattern:
1. **Context**: Provide relevant data (deck, collection, cards)
2. **Instructions**: Clear numbered list of what to analyze
3. **Format**: Request specific output format
4. **Trailing marker**: "Referenced Cards: [list]" for card extraction

---

## 🎓 User Education

### Onboarding Tips
Users should know:
- AI features are available across all major pages
- Click the Brain/Sparkles icon to get AI insights
- "Detailed" mode provides comprehensive analysis
- "Quick" mode gives fast, actionable advice
- All AI responses include card links when relevant

### Best Results
- Provide specific questions for better answers
- Use Brain page for interactive deck analysis
- Reference commanders by name for better suggestions
- Include budget constraints when asking for upgrades

---

## Summary

Every major page now has contextual AI assistance powered by MTG Brain:
- **Dashboard**: Deck portfolio recommendations
- **Collection**: Collection analysis and gaps
- **Wishlist**: Strategic purchasing advice
- **Deck Builder**: Deck coaching and optimization
- **Marketplace**: Pricing and selling strategy
- **Templates**: Archetype recommendations
- **Scan**: Scanned card insights
- **Cards**: Individual card analysis
- **Brain**: Full conversational AI assistant

All features share consistent design, error handling, and user experience patterns.
