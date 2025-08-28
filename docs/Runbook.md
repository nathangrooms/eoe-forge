# MTG Deckbuilder - Development Runbook

## Prerequisites

- Node.js 18+ and npm
- Git
- Supabase account (for backend)

## Local Development Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd mtg-deckbuilder
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Update .env with your Supabase credentials
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   - Opens at http://localhost:8080
   - Hot reload enabled

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run build:dev` - Development build
- `npm run lint` - ESLint check
- `npm run preview` - Preview production build

## Current Architecture

**Frontend:**
- React 18 + TypeScript
- Vite build tool
- Tailwind CSS + shadcn/ui components
- Zustand for state management
- React Router for navigation
- React Query for API calls

**Backend:**
- Supabase (Postgres + Auth + Edge Functions)
- Edge Functions for AI deck building
- RLS policies for data security

**Key Folders:**
- `src/components/` - Reusable UI components
- `src/pages/` - Route components
- `src/stores/` - Zustand stores
- `src/lib/` - Utilities and business logic
- `supabase/` - Database migrations and functions

## Database Tables

Currently implemented:
- `profiles` - User profile data
- `user_decks` - User deck metadata
- `deck_cards` - Cards in decks
- `user_collections` - User card collections

## Known Issues

- AI deck builder sometimes returns empty decks
- Limited card search functionality
- No admin panel yet
- Missing comprehensive error handling

## Development Workflow

1. Create feature branch from main
2. Make changes with TypeScript
3. Test locally with `npm run dev`
4. Lint with `npm run lint`
5. Build with `npm run build`
6. Submit PR

## Deployment

- Frontend: Auto-deployed via Lovable
- Backend: Supabase edge functions auto-deployed
- Database: Migrations applied automatically