# Theme & Design System Audit

## Critical Issues

### 1. Invisible Text (CRITICAL - FIX IMMEDIATELY)

**Problem**: Text using `bg-gradient-cosmic bg-clip-text text-transparent` is invisible on dark backgrounds.

**Affected Files**:
- `src/pages/Dashboard.tsx` (line 106-107): "Welcome back, Planeswalker"
- `src/components/marketing/Hero.tsx` (line 52-54): "DeckMatrix" heading

**Fix**: Replace with proper gradient text that maintains readability:
```tsx
// ❌ WRONG - Invisible
<h1 className="bg-gradient-cosmic bg-clip-text text-transparent">

// ✅ CORRECT - Visible
<h1 className="text-foreground">
```

### 2. RGB Colors in Design System (CRITICAL)

**Problem**: MTG mana colors defined as RGB in `src/index.css` (lines 75-79), but Tailwind config expects HSL.

**Current (WRONG)**:
```css
--mana-white: 251 248 229; /* #FFFBD5 */
--mana-blue: 14 104 171; /* #0E68AB */
```

**Should Be (HSL)**:
```css
--mana-white: 56 100% 94%;  /* hsl(56, 100%, 94%) */
--mana-blue: 201 85% 36%;   /* hsl(201, 85%, 36%) */
```

### 3. Hardcoded Colors (89+ instances)

**Pattern**: Direct use of `text-white`, `bg-white`, `text-black`, `bg-black` instead of semantic tokens.

**Most Affected Files**:
- `src/components/deck-builder/EnhancedDeckAnalysis.tsx` (7 instances)
- `src/features/collection/EnhancedCardSearch.tsx` (multiple)
- `src/components/universal/UniversalFilterPanel.tsx` (multiple)
- `src/pages/Homepage.tsx` (Hero section)

**Example Fixes**:
```tsx
// ❌ WRONG
<div className="text-white">Text</div>
<div className="bg-black/80">Overlay</div>

// ✅ CORRECT
<div className="text-foreground">Text</div>
<div className="bg-background/80">Overlay</div>
```

## Design System Analysis

### Current State

**Defined Tokens** (in `src/index.css`):
✅ Background: `--background`, `--card`, `--popover`, `--muted`
✅ Foreground: `--foreground`, `--muted-foreground`
✅ Primary: `--primary`, `--primary-foreground`
✅ Secondary: `--secondary`, `--secondary-foreground`
✅ Accent: `--accent`, `--accent-foreground`
✅ Gradients: `--gradient-cosmic`, `--gradient-nebula`, `--gradient-starfield`
✅ Spacecraft: `--spacecraft`, `--station`, `--warp`, `--void`, `--planet`
✅ Card Types: `--type-commander`, `--type-lands`, etc.
❌ Mana Colors: RGB instead of HSL

**Tailwind Mapping** (in `tailwind.config.ts`):
✅ All semantic tokens mapped correctly with `hsl(var(--token))`
✅ Spacecraft colors mapped
✅ Card type colors mapped
✅ Background gradients mapped

### Token Usage Analysis

**Components Using Tokens Correctly**:
- `src/components/ui/*` (Shadcn components)
- `src/components/layouts/StandardPageLayout.tsx`
- `src/pages/Admin.tsx`

**Components NOT Using Tokens**:
- Most deck-builder components
- Collection components
- Universal card search
- Marketing components

## Hardcoded Color Breakdown

### By Category

**White/Black Text** (62 instances):
- `text-white` - Used for contrast on colored backgrounds
- `text-black` - Rarely used
- **Should map to**: `text-foreground`, `text-primary-foreground`, `text-accent-foreground`

**White/Black Backgrounds** (27 instances):
- `bg-white` - Used for light overlays
- `bg-black/80` - Used for dark overlays, modals
- **Should map to**: `bg-background`, `bg-card`, `bg-popover`

### By Component Type

**Modals & Overlays**:
- Alert Dialog: `bg-black/80` → should use `bg-background/80`
- Dialog: `bg-black/80` → should use `bg-background/80`
- Drawer: `bg-black/80` → should use `bg-background/80`
- Sheet: `bg-black/80` → should use `bg-background/80`

**Card Hovers**:
- Card hover overlays: `bg-black/60` → should use `bg-muted/90`
- Button text on hovers: `text-white` → should use `text-foreground`

**Badges & Pills**:
- Mana symbols: `text-white` → should use `text-foreground`
- AI badges: `text-white` → should use `text-primary-foreground`

## Color Palette Recommendations

### Semantic Tokens (Keep Current)
```css
/* Primary brand colors */
--primary: 250 70% 60%;           /* Cosmic purple */
--accent: 280 60% 55%;            /* Cosmic pink */

/* Backgrounds */
--background: 228 25% 8%;         /* Near-black navy */
--card: 228 20% 12%;              /* Card surface */
--muted: 228 15% 15%;             /* Muted elements */

/* Foreground */
--foreground: 220 15% 95%;        /* Primary text */
--muted-foreground: 220 10% 65%; /* Secondary text */
```

### Mana Colors (NEEDS FIX)
```css
/* Current (RGB - WRONG) */
--mana-white: 251 248 229;
--mana-blue: 14 104 171;
--mana-black: 21 11 0;
--mana-red: 211 32 42;
--mana-green: 0 115 62;

/* Should be (HSL - CORRECT) */
--mana-white: 56 100% 94%;   /* #FFFBD5 */
--mana-blue: 201 85% 36%;    /* #0E68AB */
--mana-black: 33 100% 4%;    /* #150B00 */
--mana-red: 356 73% 48%;     /* #D3202A */
--mana-green: 162 100% 23%;  /* #00733E */
```

### Usage in Tailwind
```tsx
// Mana color usage after fix
<div className="bg-[hsl(var(--mana-white))]">White</div>
<div className="text-[hsl(var(--mana-blue))]">Blue</div>
```

## Component-Specific Issues

### Dashboard (src/pages/Dashboard.tsx)

**Issues**:
1. Line 106-107: Invisible gradient text
2. Lines 50-68: Hardcoded MTG mana color badges using RGB
3. Line 115: `text-white` in avatar fallback

**Fixes Needed**:
```tsx
// Line 106-107: Fix invisible text
- <h1 className="text-3xl md:text-4xl font-bold bg-gradient-cosmic bg-clip-text text-transparent">
+ <h1 className="text-3xl md:text-4xl font-bold text-foreground">
  Welcome back, Planeswalker
</h1>

// Lines 50-68: Use semantic mana color tokens
- <div className={`w-3 h-3 rounded-full border ${colorMap[color]}`} />
+ <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: `hsl(var(--mana-${color.toLowerCase()}))` }} />

// Line 115: Use token
- <AvatarFallback className="bg-gradient-cosmic text-white">
+ <AvatarFallback className="bg-gradient-cosmic text-primary-foreground">
```

### Hero (src/components/marketing/Hero.tsx)

**Issues**:
1. Line 52-54: Gradient text potentially invisible
2. Lines 16-30: Mana symbol backgrounds using RGB

**Fixes Needed**:
```tsx
// Line 52-54: Ensure visibility
- <span className="bg-gradient-primary bg-clip-text text-transparent">
+ <span className="text-primary">
  DeckMatrix
</span>

// Line 16: Use HSL token
- <div className="... bg-mana-white/30 ...">
+ <div className="... bg-[hsl(var(--mana-white)_/_0.3)] ...">
```

### Deck Builder Components

**Common Pattern** (needs fixing in all deck builder components):
```tsx
// ❌ WRONG - Hardcoded white text
<div className="bg-spacecraft/10 p-3 rounded-lg">
  <span className="text-xs font-bold text-white">DM</span>
</div>

// ✅ CORRECT - Semantic token
<div className="bg-spacecraft/10 p-3 rounded-lg">
  <span className="text-xs font-bold text-foreground">DM</span>
</div>
```

**Files Needing Updates**:
- `src/components/deck-builder/AIAnalysisPanel.tsx`
- `src/components/deck-builder/EnhancedDeckAnalysis.tsx` (7 instances)
- `src/components/deck-builder/DeckAnalysisModal.tsx`

### UI Components (Overlays)

**Common Pattern** (needs fixing):
```tsx
// ❌ WRONG - Hardcoded black overlay
<div className="fixed inset-0 z-50 bg-black/80">

// ✅ CORRECT - Semantic overlay
<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
```

**Files Needing Updates**:
- `src/components/ui/alert-dialog.tsx` (line 19)
- `src/components/ui/dialog.tsx` (line 22)
- `src/components/ui/drawer.tsx` (line 29)
- `src/components/ui/sheet.tsx` (line 22)

## Migration Strategy

### Phase 1: Critical Fixes (DO NOW)
1. ✅ Fix invisible text (Dashboard, Hero)
2. ✅ Convert mana colors to HSL in index.css
3. ✅ Create migration script to find all hardcoded colors

### Phase 2: Systematic Replacement
1. Fix UI overlay components (dialogs, modals, drawers)
2. Fix deck-builder components
3. Fix collection components
4. Fix marketing components

### Phase 3: Validation
1. Visual regression testing
2. Manual QA of all pages
3. Accessibility contrast testing

## Automated Migration Script

Create `scripts/fix-hardcoded-colors.mjs`:
```javascript
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const replacements = [
  { from: 'text-white', to: 'text-foreground' },
  { from: 'bg-black/80', to: 'bg-background/80' },
  { from: 'bg-black/60', to: 'bg-muted/90' },
  // ... more mappings
];

// Scan and replace
```

## Testing Checklist

After fixes:
- [ ] Homepage hero text visible
- [ ] Dashboard greeting visible
- [ ] All modals have proper backgrounds
- [ ] Card hovers show correctly
- [ ] Mana symbols display correctly
- [ ] Dark mode consistent across all pages
- [ ] No white-on-white or black-on-black text
- [ ] Gradient text legible
- [ ] All interactive elements have visible focus states

## Documentation Updates Needed

- [ ] Update design system docs with token usage examples
- [ ] Create component styling guide
- [ ] Document mana color usage patterns
- [ ] Add examples of correct gradient usage
