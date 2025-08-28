#!/usr/bin/env node

/**
 * AI Deck Builder Test Harness
 * Tests the deterministic deck builder across multiple formats
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const testCases = [
  {
    name: 'Commander Simic Midrange',
    request: {
      format: 'commander',
      colors: ['G', 'U'],
      identity: ['G', 'U'],
      themeId: 'midrange',
      powerTarget: 7,
      budget: 'med',
      seed: 12345
    },
    expectations: {
      deckSize: 100,
      powerRange: [6, 8],
      hasCommander: true,
      maxCopies: 1
    }
  },
  {
    name: 'Modern Red Aggro',
    request: {
      format: 'modern',
      colors: ['R'],
      themeId: 'aggro',
      powerTarget: 5,
      budget: 'med',
      seed: 54321
    },
    expectations: {
      deckSize: 60,
      powerRange: [4, 6],
      hasCommander: false,
      maxCopies: 4
    }
  },
  {
    name: 'Standard Blue-White Control',
    request: {
      format: 'standard',
      colors: ['W', 'U'],
      themeId: 'control',
      powerTarget: 6,
      budget: 'high',
      seed: 99999
    },
    expectations: {
      deckSize: 60,
      powerRange: [5, 7],
      hasCommander: false,
      maxCopies: 4
    }
  }
];

async function runTest(testCase) {
  console.log(`\\n🧪 Testing: ${testCase.name}`);
  console.log(`📋 Request: ${JSON.stringify(testCase.request, null, 2)}`);
  
  try {
    const startTime = Date.now();
    
    const { data, error } = await supabase.functions.invoke('ai-deck-builder', {
      body: testCase.request
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (error) {
      console.log(`❌ FAILED: ${error.message}`);
      return false;
    }
    
    if (!data || !data.decklist) {
      console.log(`❌ FAILED: No decklist returned`);
      return false;
    }
    
    // Validate results
    const result = data;
    const deck = result.decklist;
    const expectations = testCase.expectations;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Results:`);
    console.log(`   - Cards Generated: ${deck.length}/${expectations.deckSize}`);
    console.log(`   - Power Level: ${result.power.toFixed(1)} (target: ${testCase.request.powerTarget})`);
    console.log(`   - Changelog Entries: ${result.changelog.length}`);
    
    // Test deck size
    if (deck.length !== expectations.deckSize) {
      console.log(`❌ FAILED: Expected ${expectations.deckSize} cards, got ${deck.length}`);
      return false;
    }
    
    // Test power level
    const powerInRange = result.power >= expectations.powerRange[0] && 
                        result.power <= expectations.powerRange[1];
    if (!powerInRange) {
      console.log(`❌ FAILED: Power ${result.power} not in range [${expectations.powerRange[0]}, ${expectations.powerRange[1]}]`);
      return false;
    }
    
    // Test card legality (simplified)
    const cardNames = deck.map(card => card.name);
    const uniqueCards = new Set(cardNames);
    const maxCopies = Math.max(...Array.from(uniqueCards).map(name => 
      cardNames.filter(cardName => cardName === name).length
    ));
    
    if (maxCopies > expectations.maxCopies) {
      console.log(`❌ FAILED: Found ${maxCopies} copies of a card, max allowed: ${expectations.maxCopies}`);
      return false;
    }
    
    // Test changelog
    if (result.changelog.length === 0) {
      console.log(`❌ FAILED: No changelog entries found`);
      return false;
    }
    
    // Test subscores
    const subscoreKeys = Object.keys(result.subscores);
    const expectedSubscores = ['speed', 'interaction', 'ramp', 'cardAdvantage', 'tutors', 'wincons', 'resilience', 'mana', 'synergy'];
    const missingSubscores = expectedSubscores.filter(key => !subscoreKeys.includes(key));
    
    if (missingSubscores.length > 0) {
      console.log(`❌ FAILED: Missing subscores: ${missingSubscores.join(', ')}`);
      return false;
    }
    
    console.log(`✅ PASSED: All validations successful`);
    console.log(`📈 Subscores: ${Object.entries(result.subscores).map(([k,v]) => \`\${k}:\${Math.round(v)}\`).join(', ')}`);
    console.log(`📝 Analysis: ${result.analysis}`);
    
    return true;
    
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting AI Deck Builder Test Suite');
  console.log('=====================================\\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const success = await runTest(testCase);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('\\n=====================================');
  console.log('📊 Test Results Summary');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\\n🎉 All tests passed! The AI Deck Builder is working correctly.');
  } else {
    console.log('\\n⚠️  Some tests failed. Please check the AI Deck Builder implementation.');
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests, runTest, testCases };