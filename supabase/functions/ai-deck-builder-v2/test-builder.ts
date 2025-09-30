// Comprehensive testing system for deck builder
import { BuilderOrchestrator } from './builder-orchestrator.ts';

interface TestCommander {
  id: string;
  name: string;
  oracle_text: string;
  type_line: string;
  color_identity: string[];
  colors: string[];
  archetype: string;
  expectedQualities: {
    minRamp: number;
    minDraw: number;
    minRemoval: number;
    avgCMC: { min: number; max: number };
  };
}

const TEST_COMMANDERS: TestCommander[] = [
  {
    id: 'atraxa',
    name: 'Atraxa, Praetors\' Voice',
    oracle_text: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.',
    type_line: 'Legendary Creature — Phyrexian Angel',
    color_identity: ['W', 'U', 'B', 'G'],
    colors: ['W', 'U', 'B', 'G'],
    archetype: 'commander-counters',
    expectedQualities: {
      minRamp: 10,
      minDraw: 10,
      minRemoval: 10,
      avgCMC: { min: 2.8, max: 3.8 }
    }
  },
  {
    id: 'talrand',
    name: 'Talrand, Sky Summoner',
    oracle_text: 'Flying\nWhenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.',
    type_line: 'Legendary Creature — Merfolk Wizard',
    color_identity: ['U'],
    colors: ['U'],
    archetype: 'commander-spellslinger',
    expectedQualities: {
      minRamp: 8,
      minDraw: 12,
      minRemoval: 8,
      avgCMC: { min: 2.5, max: 3.5 }
    }
  },
  {
    id: 'meren',
    name: 'Meren of Clan Nel Toth',
    oracle_text: 'Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card\'s mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.',
    type_line: 'Legendary Creature — Human Shaman',
    color_identity: ['B', 'G'],
    colors: ['B', 'G'],
    archetype: 'commander-aristocrats',
    expectedQualities: {
      minRamp: 10,
      minDraw: 10,
      minRemoval: 12,
      avgCMC: { min: 2.8, max: 4.0 }
    }
  }
];

export class DeckBuilderTester {
  /**
   * Run comprehensive tests on the deck builder
   */
  static async runTests(
    cardPool: any[],
    lovableApiKey?: string
  ): Promise<{
    passed: number;
    failed: number;
    results: Array<{
      commander: string;
      passed: boolean;
      issues: string[];
      score: number;
      feedback?: string;
    }>;
  }> {
    console.log('='.repeat(80));
    console.log('DECK BUILDER TEST SUITE');
    console.log('='.repeat(80));
    
    const results: Array<{
      commander: string;
      passed: boolean;
      issues: string[];
      score: number;
      feedback?: string;
    }> = [];
    
    for (const testCase of TEST_COMMANDERS) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Testing: ${testCase.name} (${testCase.archetype})`);
      console.log(`${'='.repeat(80)}\n`);
      
      try {
        // Build deck
        const result = await BuilderOrchestrator.buildDeck(
          cardPool,
          {
            format: 'commander',
            themeId: testCase.archetype,
            powerTarget: 6,
            identity: testCase.color_identity,
            budget: 'med',
            seed: Date.now()
          },
          null // No AI plan for automated testing
        );
        
        // Validate deck
        const issues = this.validateDeck(result.deck, testCase);
        const score = this.scoreDeck(result.deck, testCase);
        
        // Get AI feedback if available
        let feedback: string | undefined;
        if (lovableApiKey) {
          feedback = await this.getAIFeedback(result.deck, testCase, lovableApiKey);
        }
        
        const passed = issues.length === 0 && score >= 70;
        
        results.push({
          commander: testCase.name,
          passed,
          issues,
          score,
          feedback
        });
        
        console.log(`✓ Build completed: ${result.deck.length} cards`);
        console.log(`✓ Validation: ${passed ? 'PASSED' : 'FAILED'}`);
        console.log(`✓ Quality Score: ${score}/100`);
        
        if (issues.length > 0) {
          console.log(`\n⚠ Issues found:`);
          issues.forEach(issue => console.log(`  - ${issue}`));
        }
        
        if (feedback) {
          console.log(`\n🤖 AI Feedback:`);
          console.log(feedback);
        }
        
      } catch (error) {
        console.error(`✗ Test failed with error:`, error);
        results.push({
          commander: testCase.name,
          passed: false,
          issues: [`Build error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          score: 0
        });
      }
    }
    
    // Summary
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(80)}\n`);
    
    return { passed, failed, results };
  }
  
  /**
   * Validate deck meets requirements
   */
  private static validateDeck(deck: any[], testCase: TestCommander): string[] {
    const issues: string[] = [];
    
    // Check deck size
    if (deck.length !== 99) {
      issues.push(`Invalid deck size: ${deck.length} (expected 99)`);
    }
    
    // Check ramp
    const rampCount = deck.filter(c => c.tags?.has('ramp')).length;
    if (rampCount < testCase.expectedQualities.minRamp) {
      issues.push(`Insufficient ramp: ${rampCount} (expected at least ${testCase.expectedQualities.minRamp})`);
    }
    
    // Check draw
    const drawCount = deck.filter(c => c.tags?.has('draw')).length;
    if (drawCount < testCase.expectedQualities.minDraw) {
      issues.push(`Insufficient card draw: ${drawCount} (expected at least ${testCase.expectedQualities.minDraw})`);
    }
    
    // Check removal
    const removalCount = deck.filter(c => 
      c.tags?.has('removal-spot') || c.tags?.has('removal-sweeper')
    ).length;
    if (removalCount < testCase.expectedQualities.minRemoval) {
      issues.push(`Insufficient removal: ${removalCount} (expected at least ${testCase.expectedQualities.minRemoval})`);
    }
    
    // Check mana curve
    const avgCMC = deck.reduce((sum, c) => sum + (c.cmc || 0), 0) / deck.length;
    if (avgCMC < testCase.expectedQualities.avgCMC.min || avgCMC > testCase.expectedQualities.avgCMC.max) {
      issues.push(
        `Mana curve out of range: ${avgCMC.toFixed(2)} ` +
        `(expected ${testCase.expectedQualities.avgCMC.min}-${testCase.expectedQualities.avgCMC.max})`
      );
    }
    
    // Check archetype synergy
    const synergyCount = this.countSynergyCards(deck, testCase.archetype);
    if (synergyCount < 15) {
      issues.push(`Weak archetype synergy: only ${synergyCount} synergistic cards (expected at least 15)`);
    }
    
    // Check for too many bulk cards
    const bulkCount = deck.filter(c => {
      const price = parseFloat(c.prices?.usd || '0');
      return price < 0.10 && c.rarity === 'common';
    }).length;
    if (bulkCount > 20) {
      issues.push(`Too many bulk cards: ${bulkCount} (maximum 20 recommended)`);
    }
    
    return issues;
  }
  
  /**
   * Score deck quality (0-100)
   */
  private static scoreDeck(deck: any[], testCase: TestCommander): number {
    let score = 50; // Start at 50
    
    // Deck size (10 points)
    if (deck.length === 99) score += 10;
    
    // Ramp quality (15 points)
    const rampCount = deck.filter(c => c.tags?.has('ramp')).length;
    const rampScore = Math.min(15, (rampCount / testCase.expectedQualities.minRamp) * 15);
    score += rampScore;
    
    // Draw quality (15 points)
    const drawCount = deck.filter(c => c.tags?.has('draw')).length;
    const drawScore = Math.min(15, (drawCount / testCase.expectedQualities.minDraw) * 15);
    score += drawScore;
    
    // Removal quality (15 points)
    const removalCount = deck.filter(c => 
      c.tags?.has('removal-spot') || c.tags?.has('removal-sweeper')
    ).length;
    const removalScore = Math.min(15, (removalCount / testCase.expectedQualities.minRemoval) * 15);
    score += removalScore;
    
    // Mana curve (10 points)
    const avgCMC = deck.reduce((sum, c) => sum + (c.cmc || 0), 0) / deck.length;
    if (avgCMC >= testCase.expectedQualities.avgCMC.min && avgCMC <= testCase.expectedQualities.avgCMC.max) {
      score += 10;
    }
    
    // Archetype synergy (15 points)
    const synergyCount = this.countSynergyCards(deck, testCase.archetype);
    const synergyScore = Math.min(15, (synergyCount / 20) * 15);
    score += synergyScore;
    
    // Card quality (15 points)
    const avgPrice = deck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0) / deck.length;
    const qualityScore = Math.min(15, (avgPrice / 2) * 15); // $2 avg = full points
    score += qualityScore;
    
    return Math.round(Math.min(100, score));
  }
  
  /**
   * Count cards that synergize with archetype
   */
  private static countSynergyCards(deck: any[], archetype: string): number {
    const synergyTags: Record<string, string[]> = {
      'commander-counters': ['counters', 'proliferate', 'planeswalker'],
      'commander-spellslinger': ['spellslinger', 'instant', 'sorcery', 'storm'],
      'commander-aristocrats': ['aristocrats', 'sac-outlet', 'tokens', 'recursion'],
      'commander-tokens': ['tokens', 'anthems', 'aristocrats'],
      'commander-voltron': ['equipment', 'auras', 'protection'],
      'commander-reanimator': ['recursion', 'self-mill', 'reanimator']
    };
    
    const relevantTags = synergyTags[archetype] || [];
    return deck.filter(c => 
      relevantTags.some(tag => c.tags?.has(tag))
    ).length;
  }
  
  /**
   * Get AI feedback on deck quality
   */
  private static async getAIFeedback(
    deck: any[],
    testCase: TestCommander,
    lovableApiKey: string
  ): Promise<string> {
    try {
      const deckList = deck.map(c => c.name).join('\n');
      
      const prompt = `Analyze this ${testCase.name} Commander deck (${testCase.archetype} strategy):

Deck (${deck.length} cards):
${deckList}

Provide a brief assessment:
1. Does it follow the ${testCase.archetype} strategy effectively?
2. Are card quotas appropriate (ramp, draw, removal)?
3. Is the mana curve balanced?
4. Does it have clear win conditions?
5. Overall quality rating (1-10) and main strength/weakness.

Keep response under 200 words.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are an expert Magic: The Gathering deck analyst. Be critical but constructive.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      }
    } catch (error) {
      console.error('AI feedback error:', error);
    }
    
    return 'AI feedback unavailable';
  }
}
