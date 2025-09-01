# Deck Manager Audit Report

## Current Implementation Analysis

### Location
- Main page: `src/pages/Decks.tsx`
- Deck tiles: `src/components/deck-builder/EnhancedDeckTile.tsx` and `src/components/ui/standardized-components.tsx`

### What's Live vs Static/Mocked

#### ✅ Live Data
- Deck list from Supabase (`user_decks` table)
- Basic deck info (name, format, colors, power level)
- Local deck management via `useDeckManagementStore`
- Deck card count from `deck_cards` table
- Deck creation/deletion
- Commander loading (with API calls to Scryfall)

#### ❌ Static/Mocked Data
- **Power analysis**: No detailed power scoring system integration
- **Collection ownership**: No integration with user collection to show missing cards
- **Deck value/pricing**: Set to 0, no real pricing calculation
- **Mana curve analysis**: Not displayed in tiles
- **Type distribution**: Basic counts only, no detailed breakdowns
- **Legality validation**: Not implemented
- **Favorites system**: Missing entirely - this is critical for Collection Manager integration
- **Storage/deckbox links**: No connection to storage containers
- **Analysis modal**: No detailed power subscores
- **Missing cards drawer**: No collection comparison

### Current Gaps

1. **No Favorites System**: Critical missing feature preventing deck favorites from appearing in Collection Manager
2. **No API Endpoints**: Missing `/api/decks/*` endpoints for summaries, favorites, export
3. **Static Metrics**: Power, value, curve, legality all need real computation
4. **No Analysis Modal**: Missing detailed power analysis overlay
5. **No Collection Integration**: Can't see owned vs missing cards
6. **No Storage Links**: No connection to deckbox containers
7. **Limited Export**: No Arena/MTGO format exports

### Architecture Issues
1. Mixing local store and Supabase data creates complexity
2. No centralized deck summary computation
3. No favorites table in database
4. Power scoring not integrated with tiles
5. No caching/memoization for expensive computations

## Implementation Priority

1. **Database Schema**: Add favorites table, ensure deck summary can be computed
2. **API Layer**: Create summary and favorites endpoints
3. **Deck Tiles**: Refresh with live metrics while keeping layout
4. **Favorites**: Implement toggle and Collection Manager integration
5. **Analysis Modal**: Create detailed power breakdown modal
6. **Missing Cards**: Build collection comparison drawer
7. **Storage Integration**: Link deckbox containers

## Success Criteria
- All deck tiles show live power, value, curve, legality, collection fit
- Favorites work and appear in Collection Manager
- Analysis modal shows detailed power subscores
- Missing cards drawer functional
- Storage integration working
- Export functionality implemented
- Same visual layout maintained