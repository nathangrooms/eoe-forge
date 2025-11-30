# DeckMatrix Animation System

## Overview

The DeckMatrix animation system provides high-quality, performant animations for all card actions in the battle simulator using GSAP (GreenSock Animation Platform) and React integration.

## Architecture

### Core Components

1. **AnimationManager** (`src/lib/simulation/animations.ts`)
   - Central animation system using GSAP
   - Handles all card action animations
   - Respects accessibility settings (prefers-reduced-motion)
   - Provides hardware-accelerated transforms

2. **useGameAnimations Hook** (`src/hooks/useGameAnimations.ts`)
   - React hook that connects the animation system to game state
   - Automatically detects state changes and triggers animations
   - Manages card element registration
   - Handles animation speed control

3. **AnimatedCard Component** (`src/components/simulation/AnimatedCard.tsx`)
   - Wrapper around FullCardDisplay
   - Registers cards for animation system
   - Passes refs to enable DOM manipulation

## Supported Animations

### 1. CAST_SPELL
- Card lifts and moves to stack
- Glow effect (purple/blue)
- Smooth transition
- **Duration:** ~0.75s

### 2. ATTACK_START
- Creature pulses and charges forward
- Red glow effect
- Moves toward target (if present)
- **Duration:** ~0.6s

### 3. ATTACK_RESOLVE / BATTLE_DAMAGE
- Flash red on damaged card
- Shake effect
- Floating damage number
- **Duration:** ~0.8s

### 4. CREATURE_DIES
- Violent shake
- Darken and crack effect
- Rotate and fly to graveyard
- **Duration:** ~0.7s

### 5. TOKEN_CREATED
- Materialize from scale 0
- Bounce effect with back-easing
- Glow effect
- **Duration:** ~0.5s

### 6. COUNTER_ADDED
- Counter badge pops in
- Scale bounce effect
- **Duration:** ~0.35s

### 7. MOVE_ZONE
- Smooth fly between zones
- Optional rotation (for face-down cards)
- Fade in/out
- **Duration:** ~0.8s

### 8. TAP / UNTAP
- Rotate 90° / back to 0°
- Smooth power2 easing
- **Duration:** ~0.3s

### 9. DRAW_CARD
- Slide from library to hand
- Fade and scale in
- **Duration:** ~0.4s

### 10. EXILE
- Fly off screen with 720° rotation
- Shrink and fade
- **Duration:** ~0.6s

## Usage

### Basic Integration

The animation system is automatically integrated with the battle simulator. No manual setup required!

```tsx
// In Simulate.tsx
const { registerCard } = useGameAnimations(gameState, speed);

<GameBoard state={gameState} onRegisterCard={registerCard} />
```

### Animation Speed Control

Speed is controlled through the simulation speed setting (0.25x to 2x):

```tsx
AnimationManager.setSpeed(0.5); // Half speed
AnimationManager.setSpeed(2);   // Double speed
```

### Manual Animation Triggering

You can manually trigger animations if needed:

```tsx
import { AnimationManager } from '@/lib/simulation/animations';

// Attack animation
await AnimationManager.attackStart({
  cardElement: document.getElementById('card-123'),
  targetElement: document.getElementById('card-456')
});

// Death animation
await AnimationManager.creatureDies({
  cardElement: document.getElementById('card-123'),
  targetElement: document.getElementById('graveyard')
});
```

## Performance Considerations

### Optimization Techniques

1. **Hardware Acceleration**
   - All animations use `transform` and `opacity` (GPU-accelerated)
   - `will-change` property set during animations
   - Properties cleared after animation completes

2. **Reduced Motion Support**
   - Detects `prefers-reduced-motion` media query
   - Skips animations when user prefers reduced motion
   - Instant state changes instead

3. **Memory Management**
   - Animations tracked and can be killed on cleanup
   - DOM elements removed after animations complete
   - Timeline references cleared

### Best Practices

- ✅ Use `transform` and `opacity` for animations
- ✅ Set `will-change` at animation start
- ✅ Clear `will-change` after animation ends
- ❌ Avoid animating `width`, `height`, `left`, `top`
- ❌ Don't animate layout properties
- ❌ Don't create animations in render loops

## Accessibility

The animation system respects accessibility preferences:

```typescript
// Automatically skips animations if user prefers reduced motion
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Skip animation, apply instant state change
  return Promise.resolve();
}
```

## Future Enhancements

Planned features for future releases:

1. **Particle Effects**
   - Dust/smoke on creature death
   - Sparkles on token creation
   - Energy trails on spell casting

2. **Advanced Combat**
   - Attack arrows with bezier curves
   - Blocking indicators
   - Damage number trails

3. **UI Feedback**
   - Life total change animations
   - Mana pool animations
   - Phase transition effects

4. **Sound Effects**
   - Whoosh on spell cast
   - Impact on attack
   - Shatter on death

5. **Custom Animations**
   - Per-card-type animations
   - Keyword-specific effects (Flying, First Strike, etc.)
   - Legendary creature special effects

## Debugging

### Enable Animation Debug Mode

```typescript
// In browser console
AnimationManager.setSpeed(0.1); // Very slow motion
```

### View Active Animations

```typescript
// In browser console
console.log(AnimationManager.activeAnimations);
```

### Kill All Animations

```typescript
AnimationManager.killAll();
```

## API Reference

### AnimationManager

#### Methods

- `static setSpeed(speed: number)`: Set global animation speed multiplier
- `static shouldReduceMotion(): boolean`: Check if animations should be reduced
- `static castSpell(payload: AnimationPayload): Promise<void>`
- `static attackStart(payload: AnimationPayload): Promise<void>`
- `static battleDamage(payload: AnimationPayload): Promise<void>`
- `static creatureDies(payload: AnimationPayload): Promise<void>`
- `static tokenCreated(payload: AnimationPayload): Promise<void>`
- `static counterAdded(payload: AnimationPayload): Promise<void>`
- `static moveZone(payload: AnimationPayload): Promise<void>`
- `static tap(payload: AnimationPayload): Promise<void>`
- `static untap(payload: AnimationPayload): Promise<void>`
- `static drawCard(payload: AnimationPayload): Promise<void>`
- `static exile(payload: AnimationPayload): Promise<void>`
- `static killAll()`: Kill all active animations

#### AnimationPayload

```typescript
interface AnimationPayload {
  cardElement: HTMLElement;
  targetElement?: HTMLElement;
  sourceZone?: string;
  targetZone?: string;
  damage?: number;
  counters?: number;
}
```

### useGameAnimations Hook

```typescript
const { registerCard } = useGameAnimations(
  gameState: GameState | null,
  speed: number
);

// registerCard function signature
registerCard(instanceId: string, element: HTMLElement | null): void
```

## Dependencies

- **GSAP**: ^3.x - Animation engine
- **React**: ^18.x - Component framework
- **Framer Motion**: ^12.x - React animation library (optional)

## License

Part of the DeckMatrix project. See main project LICENSE.
