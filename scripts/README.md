# MTG Deckbuilder Test Suite

## AI Deck Builder Testing

This directory contains test scripts for validating the AI deck builder functionality.

## Usage

### Test the AI Deck Builder

```bash
# Run all AI builder tests
npm run test:builder

# Or run directly with Node
node scripts/test-builder.js
```

### Test Cases

The test suite validates:

1. **Commander Simic Midrange** (Power 7)
   - 100-card singleton deck
   - Green/Blue color identity
   - Midrange strategy
   - Power level 6-8

2. **Modern Red Aggro** (Power 5)
   - 60-card deck
   - Red aggressive strategy
   - Power level 4-6
   - Max 4 copies per card

3. **Standard Blue-White Control** (Power 6)
   - 60-card deck
   - Control strategy
   - Standard-legal cards only
   - Power level 5-7

### Validation Checks

Each test validates:

- ✅ Correct deck size for format
- ✅ Power level within ±1 of target
- ✅ Legal card copy limits
- ✅ Complete changelog with reasons
- ✅ All subscores present
- ✅ Format legality (basic check)
- ✅ Analysis text generation

### Expected Output

```
🚀 Starting AI Deck Builder Test Suite
=====================================

🧪 Testing: Commander Simic Midrange
📋 Request: { format: "commander", colors: ["G","U"], ... }
⏱️  Duration: 1247ms
📊 Results:
   - Cards Generated: 100/100
   - Power Level: 7.2 (target: 7)
   - Changelog Entries: 47
✅ PASSED: All validations successful
📈 Subscores: speed:65, interaction:78, ramp:82, ...
📝 Analysis: This deck is built for power level 7. Strengths include ramp, interaction...

... (more tests)

=====================================
📊 Test Results Summary
✅ Passed: 3
❌ Failed: 0
📈 Success Rate: 100.0%

🎉 All tests passed! The AI Deck Builder is working correctly.
```

## Adding New Tests

To add new test cases, edit `scripts/test-builder.js` and add to the `testCases` array:

```javascript
{
  name: 'Pioneer Mono-Black Control',
  request: {
    format: 'pioneer',
    colors: ['B'],
    themeId: 'control',
    powerTarget: 6,
    budget: 'high',
    seed: 11111
  },
  expectations: {
    deckSize: 60,
    powerRange: [5, 7],
    hasCommander: false,
    maxCopies: 4
  }
}
```