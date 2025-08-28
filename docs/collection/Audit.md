# Collection Feature Audit

## Current Architecture Overview

### UI Layer
- **Main Page**: `src/pages/Collection.tsx` (1047 lines) - monolithic component handling all functionality
- **Components**: 
  - `src/components/collection/BulkOperations.tsx` - import/export functionality
  - `src/components/collection/CollectionHeader.tsx` - search and filters
- **Store**: `src/stores/collectionStore.ts` - Zustand with localStorage persistence

### Database Layer
- **Table**: `user_collections` with proper structure (card_id, user_id, quantity, foil, condition, price_usd)
- **RLS**: Properly configured for user isolation
- **Missing**: Universal cards table, proper card data sync

## Critical Issues Found

### 1. Data Consistency Problems
❌ **Card ID Mismatch**: Collection uses Scryfall card IDs but no local cards table
❌ **Missing Card Data**: No universal MTG card database - relies on external API calls
❌ **Price Staleness**: No automatic price updates
❌ **Oracle ID vs Card ID**: Confusion between printing-specific and oracle IDs

### 2. UI/UX Inconsistencies  
❌ **Monolithic Component**: 1047-line Collection.tsx violates separation of concerns
❌ **Missing Loading States**: No skeletons for card loading
❌ **Inconsistent Styling**: Mix of custom styles and shadcn/ui components
❌ **Poor Error Handling**: Limited user feedback for failed operations

### 3. Performance Issues
❌ **API Abuse**: Direct Scryfall calls for every card image/search
❌ **No Caching**: Repeated API calls for same data
❌ **No Pagination**: Loads entire collection at once
❌ **Inefficient Filtering**: Client-side filtering of large datasets

### 4. Functional Gaps
❌ **Import Reliability**: Basic parsing, limited format support
❌ **No Bulk Operations**: Missing batch add/remove functionality  
❌ **Limited Analytics**: Basic value calculation only
❌ **No Synergy Analysis**: Collection synergy features not wired up

### 5. Edge of Eternities References
❌ Found in multiple files (already addressed in previous fixes)

## Data Flow Analysis

### Current Save/Load Flow
1. User adds card → Store in localStorage + user_collections table
2. Page reload → Load from user_collections, fetch card data from Scryfall API
3. **Problem**: No local card cache, slow loads, API dependency

### Recommended Flow  
1. Background sync → Scryfall bulk data → local cards table
2. User adds card → Reference local cards table
3. Collection stores card_id (printing) + quantities
4. Analytics use oracle_id for cross-printing aggregation

## Recommendation Summary

### Phase 1: Database Foundation
- [ ] Create universal `cards` table with Scryfall sync
- [ ] Add collection API endpoints with proper validation
- [ ] Implement card search with caching

### Phase 2: UI Refactor
- [ ] Break down monolithic Collection.tsx into focused components
- [ ] Standardize on shadcn/ui components throughout
- [ ] Add proper loading states and error handling

### Phase 3: Performance & Features
- [ ] Implement caching strategy for card data and images
- [ ] Add pagination and infinite scroll
- [ ] Complete analytics and synergy features

### Phase 4: Polish
- [ ] Enhanced import/export with validation
- [ ] Bulk operations UI
- [ ] Advanced filtering and search