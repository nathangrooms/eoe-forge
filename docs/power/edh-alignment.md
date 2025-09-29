# EDH Power Level Alignment

This document outlines how our power calculator aligns with the community standard edhpowerlevel.com and the broader EDH meta-game understanding.

## Power Scale (1-10)

### Casual (1-3.4)
**Philosophy**: Battlecruiser Magic, high mana value threats, minimal interaction
- **Speed**: Slow (30-40), games go to turn 8+
- **Interaction**: Basic (40-50), creature removal and simple counterspells
- **Tutors**: Minimal (0-15), mostly land ramp
- **Mana**: Basic fixing (55-65), many ETB tapped lands
- **Win Conditions**: Big creatures, combat damage, slow combo finishes
- **Expected Turn**: 10+ turns to present win

**Example Archetypes**: Precons, battlecruiser tribal, big mana strategies

### Mid Power (3.5-6.6)
**Philosophy**: Upgraded casual with some efficiency, clear game plan
- **Speed**: Moderate (50-65), games typically turn 6-8
- **Interaction**: Solid (55-70), efficient removal and counters
- **Tutors**: Some (30-45), category tutors and card selection
- **Mana**: Good fixing (65-75), mix of fast/slow lands
- **Win Conditions**: Focused synergy, some combos (7+ mana)
- **Expected Turn**: 7-9 turns to threaten win

**Example Archetypes**: Upgraded precons, focused tribal, value engines

### High Power (6.7-8.5)
**Philosophy**: Optimized strategy with backup plans, efficient execution
- **Speed**: Fast (70-80), games typically turn 4-6
- **Interaction**: Dense (70-85), multiple efficient answers
- **Tutors**: Regular (60-80), broad and category tutors
- **Mana**: Optimized (75-85), mostly untapped sources
- **Win Conditions**: Multiple lines, compact combos (4-7 mana)
- **Expected Turn**: 5-7 turns to threaten win

**Example Archetypes**: Tuned combo-control, optimized tribal, value piles

### cEDH (8.6-10)
**Philosophy**: Maximum efficiency, turn 2-4 wins, heavy interaction
- **Speed**: Explosive (85-100), turn 1-3 explosive starts
- **Interaction**: Premium (80-100), free interaction, stack wars
- **Tutors**: Saturated (90-100), unconditional tutors
- **Mana**: Perfect (85-100), fast mana, dual lands, fetches
- **Win Conditions**: Compact combos (2-4 mana), protected lines
- **Expected Turn**: 3-5 turns to win

**Example Archetypes**: Turbo combo, midrange combo-control, stax-combo

## Key Metrics Alignment

### Fast Mana Index
Matches edhpowerlevel.com's emphasis on mana acceleration:
- **Tier 1** (Sol Ring, Mana Crypt): 10 points each
- **Tier 2** (Ancient Tomb, Chrome Mox): 6 points each  
- **Tier 3** (Signets): 4 points each
- **Tier 4** (Talismans): 3 points each

### Interaction Density
Aligns with interaction quotas by power band:
- **Casual**: 6-10 pieces, mostly creatures/artifacts
- **Mid**: 10-15 pieces, some stack interaction
- **High**: 15-20 pieces, efficient and flexible
- **cEDH**: 20+ pieces, free interaction critical

### Tutor Density
Matches tutoring guidelines:
- **Casual**: 0-2 tutors (mostly land ramp)
- **Mid**: 3-5 tutors (category specific)
- **High**: 6-8 tutors (mix of broad/narrow)
- **cEDH**: 8+ tutors (unconditional access)

### Combo Detection
Implements combo categorization from edhpowerlevel.com:
- **Early Combos**: ≤7 total mana (pushes to bracket 4+)
- **Late Combos**: 8+ total mana (acceptable in bracket 3)
- **Compact Lines**: 2-card infinite combos
- **Protected Combos**: Include counterspell backup

## Playability Factors

### Keepable Hand Simulation
Monte Carlo simulation (10k hands) using Commander mulliganing:
- **Keep Criteria**: 2+ lands OR (1 land + rock) AND color access
- **Target**: 65%+ keepable for consistent deck
- **Color Hit**: T1 color access, T2 two-color access

### Mana Quality
ETB tapped land thresholds by power level:
- **Casual**: ≤50% ETB tapped acceptable
- **Mid**: ≤35% ETB tapped target
- **High**: ≤25% ETB tapped target  
- **cEDH**: ≤15% ETB tapped target

## Calibration Anchors

### Known Deck Benchmarks
- **Atraxa Superfriends (Casual)**: Power 2-3
- **Edgar Markov Aggro (Mid)**: Power 5-6
- **Thrasios/Tymna Value (High)**: Power 7-8
- **Kinnan Turbo (cEDH)**: Power 9-10

### Validation Tests
Regular testing against known deck ratings ensures alignment:
1. **Band Accuracy**: 90%+ decks score in correct band
2. **Power Stability**: Same deck rates within ±0.2 power
3. **Feature Sensitivity**: Changes affect expected subscores

## Coaching Integration

### Escalation Priorities (Target 7+)
1. Add fast mana acceleration
2. Include efficient interaction
3. Add tutoring for consistency
4. Include compact win conditions
5. Optimize mana base

### De-escalation Priorities (Target 5-)
1. Remove fast mana
2. Add ETB tapped lands
3. Remove tutors
4. Replace compact combos
5. Focus on fair game plan

## Regular Calibration

The system undergoes monthly calibration using:
- Community deck submissions with known ratings
- Tournament meta-game analysis  
- Feedback from high-level EDH players
- Comparison with edhpowerlevel.com results

This ensures our ratings stay aligned with community consensus and evolving meta-game understanding.