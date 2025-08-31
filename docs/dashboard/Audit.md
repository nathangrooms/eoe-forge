# Dashboard Audit

## Current State Analysis

### Static/Mock Data (Needs to be Made Live)
1. **Weekly Progress**: Currently randomized (Math.random() * 40 + 20) - Replace with Wishlist Value
2. **Recent Activity**: Hardcoded mock activities - Need real activity log
3. **Collection Stats**: Semi-live (uses store but may not be current)
4. **Favorite Decks**: Partially live but relies on existing favorite_decks table

### Live Data (Already Working)
1. **Collection Value**: Uses collection store calculation
2. **Total Cards**: Uses collection store
3. **Total Decks**: Fetched from user_decks table
4. **User Profile**: Live user data

### Missing Components
1. **Wishlist Value**: No current calculation
2. **Activity Logging**: No activity_log table
3. **Build Queue**: No AI build tracking
4. **Last Opened**: No session/preference tracking
5. **Health Status**: No system status monitoring

### Database Tables Status
- ✅ user_decks: Exists
- ✅ user_collections: Exists  
- ✅ listings: Exists (recently added)
- ✅ sales: Exists (recently added)
- ❓ favorite_decks: Need to verify
- ❌ activity_log: Need to create
- ❌ wishlist value calculation: Need API endpoint

### UI Enhancements Needed
1. Replace "Weekly Progress" card with "Wishlist Value"
2. Add Build Queue widget
3. Add Last Opened widget  
4. Add Health Status widget
5. Make Recent Activity live
6. Add favorite toggle to deck pages
7. Add loading skeletons
8. Add error boundaries

### API Endpoints Needed
1. GET /api/dashboard/summary - Comprehensive dashboard data
2. GET /api/wishlist/value - Wishlist value calculation
3. GET /api/activity/recent - Recent activity feed
4. POST /api/decks/favorite - Toggle deck favorite
5. GET /api/decks/favorites - User's favorite decks

### Implementation Priority
1. **High**: Replace Weekly Progress with Wishlist Value
2. **High**: Create activity_log table and tracking
3. **Medium**: Add new power widgets (Build Queue, Last Opened, Health)
4. **Medium**: Make all stats truly live with API
5. **Low**: Add advanced features (sparklines, trends)