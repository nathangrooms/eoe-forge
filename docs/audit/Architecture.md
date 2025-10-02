# DeckMatrix - System Architecture

## Overview
DeckMatrix is a full-stack Magic: The Gathering deck building and collection management platform built with React, TypeScript, Supabase, and AI integration.

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: 
  - Zustand (global stores: deck, collection, deckManagement)
  - React Query (server state)
- **UI Framework**: 
  - Tailwind CSS (utility-first styling)
  - Shadcn/ui (component library)
  - Radix UI (accessible primitives)
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation

### Backend (Supabase)
- **Database**: PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth (email, OAuth)
- **Storage**: Supabase Storage (card images, user uploads)
- **Edge Functions**: 
  - `ai-deck-builder-v2`: AI-powered deck generation
  - `mtg-brain`: Card analysis and recommendations
  - `gemini-deck-coach`: Strategic deck advice
  - `scan-match`: OCR card scanning
  - `scryfall-sync`: Card data synchronization

### External APIs
- **Scryfall API**: Card data, search, autocomplete
- **Gemini AI**: Natural language processing for deck analysis

## Directory Structure

```
src/
├── assets/                 # Static images, mockups
├── components/            
│   ├── admin/             # Admin panel components
│   ├── auth/              # Authentication layouts
│   ├── brain/             # AI Brain feature
│   ├── collection/        # Collection management
│   ├── deck-builder/      # Deck builder components
│   ├── enhanced/          # Enhanced feature components
│   ├── filters/           # Advanced filter panels
│   ├── layouts/           # Page layouts
│   ├── marketing/         # Landing page components
│   ├── navigation/        # Nav bars (top, left, mobile, public)
│   ├── search/            # Search components
│   ├── shared/            # Shared utilities
│   ├── storage/           # Physical storage management
│   ├── ui/                # Shadcn UI components
│   ├── universal/         # Universal card search/display
│   └── wishlist/          # Wishlist features
├── features/              # Feature modules
│   ├── collection/        # Collection logic
│   ├── dashboard/         # Dashboard hooks & logic
│   └── scan/              # OCR scanning
├── hooks/                 # Custom React hooks
├── integrations/          # Third-party integrations
│   └── supabase/          # Supabase client & types
├── lib/                   # Business logic & utilities
│   ├── api/               # API clients (deck, scryfall, storage, share)
│   ├── deckbuilder/       # Deck building engine
│   │   ├── score/         # Power level calculation
│   │   ├── templates/     # Deck templates
│   │   └── tagger/        # Card tagging system
│   └── magic/             # MTG game logic
├── pages/                 # Route components
├── server/                # Server-side routes
├── stores/                # Zustand stores
└── types/                 # TypeScript type definitions

supabase/
├── config.toml            # Supabase configuration
├── functions/             # Edge functions
│   ├── ai-deck-builder-v2/
│   ├── ai-deck-builder/
│   ├── gemini-deck-coach/
│   ├── mtg-brain/
│   ├── scan-match/
│   └── scryfall-sync/
└── migrations/            # Database migrations (read-only)
```

## Core Features & Pages

### Public Routes
- `/` - Homepage (Hero, Features, Pricing, Testimonials)
- `/login` - Login page
- `/register` - Registration page
- `/p/:slug` - Public deck sharing (view-only)

### Authenticated Routes
- `/dashboard` - User dashboard (stats, favorites, quick actions)
- `/collection` - Collection manager (inventory, analytics, add cards, storage)
- `/decks` - Deck manager (list, create, edit, analyze)
- `/deck-builder?deck={id}` - Deck builder interface
- `/cards` - Universal card search
- `/brain` - AI Brain (card analysis, recommendations)
- `/wishlist` - Wishlist management
- `/marketplace` - Card marketplace (selling)
- `/settings` - User settings
- `/admin` - Admin panel (AI control, sync, management)

## Data Flow

### Collection Management
1. User adds card via search → `CollectionAPI.addCardByName()`
2. Card stored in `user_collections` table with quantities
3. Real-time updates via Zustand store (`useCollectionStore`)
4. Physical storage assignment via `StorageAPI`

### Deck Building
1. User creates deck → stored in `user_decks` table
2. Cards added to deck → `deck_cards` junction table
3. AI analysis via edge functions (`mtg-brain`, `gemini-deck-coach`)
4. Power score calculated client-side (`edh-power-calculator`)
5. Deck sharing via `shareAPI` → generates public slug

### AI Deck Building
1. User specifies format, archetype, power level, colors
2. Request sent to `ai-deck-builder-v2` edge function
3. Function uses Gemini AI with strategic prompts
4. Returns deck list with card recommendations
5. Deck imported to user's deck list

## Database Schema

### Core Tables
- `profiles` - User profile data
- `user_collections` - User card ownership (card_id, quantity, foil, storage)
- `user_decks` - Deck metadata (name, format, power_level, colors, is_public)
- `deck_cards` - Cards in decks (deck_id, card_id, quantity, is_commander)
- `storage_containers` - Physical storage locations (name, type, location)
- `storage_assignments` - Card-to-container mapping
- `wishlist` - User wishlist items
- `listings` - Marketplace listings (for_sale, sold)
- `activity_log` - User activity tracking

### Scryfall Cache
- `scryfall_cards` - Cached card data from Scryfall API

## State Management

### Zustand Stores
1. **deckStore** (`src/stores/deckStore.ts`)
   - Current deck editing state
   - Commander, cards, format, power level
   - Deck operations (add/remove cards, save, load)

2. **collectionStore** (`src/stores/collectionStore.ts`)
   - User collection snapshot
   - Collection stats (value, counts)
   - Collection operations (add/remove/update cards)

3. **deckManagementStore** (`src/stores/deckManagementStore.ts`)
   - Local deck management (non-Supabase fallback)
   - Deck CRUD operations
   - Active deck tracking

## Design System

### Color Tokens (HSL-based)
- **Background**: `--background`, `--card`, `--popover`, `--muted`
- **Foreground**: `--foreground`, `--muted-foreground`
- **Primary**: `--primary`, `--primary-foreground` (cosmic purple)
- **Secondary**: `--secondary`, `--secondary-foreground`
- **Accent**: `--accent`, `--accent-foreground` (cosmic pink)
- **Spacecraft Colors**: `--spacecraft`, `--station`, `--warp`, `--void`, `--planet`
- **Card Types**: `--type-commander`, `--type-lands`, `--type-creatures`, etc.

### Gradients
- `--gradient-cosmic`: Primary → Accent gradient
- `--gradient-nebula`: Dark cosmic background
- `--gradient-starfield`: Radial background effect

### Typography
- Primary font: System font stack
- Headings: `font-bold`, gradient text effects
- Body: `text-foreground`, `text-muted-foreground`

## Known Issues

### Critical
1. **Invisible text**: `bg-gradient-cosmic bg-clip-text text-transparent` causes invisible text on dark backgrounds
2. **Mana colors**: Using RGB instead of HSL in `index.css` (lines 75-79)
3. **Hardcoded colors**: 89+ instances of `text-white`, `bg-white`, `text-black`, `bg-black` throughout codebase

### High Priority
1. Inconsistent component patterns (long 500+ line files)
2. Mixed concerns in page components (data + UI + logic)
3. No standardized error boundaries
4. Duplicate logic across collection/deck features

### Medium Priority
1. No visual regression testing
2. Missing E2E tests for critical flows
3. Limited accessibility testing
4. No performance monitoring

## Development Workflow

1. **Local Development**
   ```bash
   npm install
   npm run dev  # Starts Vite dev server on :8080
   ```

2. **Type Checking**
   ```bash
   npm run typecheck
   ```

3. **Linting**
   ```bash
   npm run lint
   ```

4. **Building**
   ```bash
   npm run build       # Production build
   npm run build:dev   # Development build
   ```

## Deployment

- **Frontend**: Auto-deployed via Lovable platform
- **Backend**: Supabase edge functions auto-deployed
- **Database**: Migrations applied automatically via Supabase CLI

## Performance Considerations

### Current Optimizations
- React lazy loading for heavy routes
- Zustand for efficient state management
- Memoized selectors for derived state
- Image lazy loading with `loading="lazy"`

### Needed Improvements
- Virtualization for large card lists (Collection, Search)
- Code splitting for deck builder bundles
- Service worker for offline card data
- CDN caching for card images
- Database query optimization (N+1 queries)

## Security

### Current Measures
- Row Level Security (RLS) on all Supabase tables
- Authentication required for all user routes
- API keys stored in environment variables
- CORS policies on edge functions

### Gaps
- No rate limiting on API endpoints
- No SQL injection prevention audits
- Missing CSRF protection
- No content security policy headers

## Next Steps

1. **Theme Unification** (Immediate)
   - Fix invisible text issues
   - Convert all colors to HSL
   - Create token-based design system
   - Audit and replace hardcoded colors

2. **Architecture Refactoring**
   - Break down long page components
   - Extract business logic to services
   - Create feature modules
   - Standardize error handling

3. **Testing Infrastructure**
   - E2E tests for critical flows (Playwright)
   - Visual regression tests
   - A11y automated testing (Axe)
   - Unit tests for business logic

4. **Performance**
   - Implement virtualization
   - Add bundle analysis
   - Optimize database queries
   - Add performance monitoring

5. **Features**
   - Complete sharing functionality
   - Finish marketplace/selling
   - Enhance AI deck builder
   - Add deck import/export
