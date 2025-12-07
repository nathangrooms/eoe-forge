// Admin configuration for AI Deck Builder
// These settings can be modified by admins to tune the deck building process

export interface AdminConfig {
  // Build iteration settings
  maxBuildIterations: number;  // Maximum rebuild attempts
  powerLevelTolerance: number; // +/- tolerance for power level (e.g., 1.5 means target 7 accepts 5.5-8.5)
  budgetTolerance: number;     // Percentage tolerance for budget (0.2 = 20%)
  
  // Card selection settings
  minLandCount: number;
  maxLandCount: number;
  minRampCount: number;
  minDrawCount: number;
  minRemovalCount: number;
  
  // Quality thresholds
  minCardPrice: number;        // Minimum card price to include (filter bulk)
  preferRareCards: boolean;    // Weight rares/mythics higher
  
  // AI settings
  useAIValidation: boolean;    // Run AI validation after build
  aiValidationModel: string;   // Model to use for validation
  
  // Singleton enforcement
  strictSingleton: boolean;    // Strictly enforce singleton rule
  
  // Logging
  verboseLogging: boolean;
}

export const DEFAULT_CONFIG: AdminConfig = {
  // Build settings - allow 3 iterations with 20% tolerance
  maxBuildIterations: 3,
  powerLevelTolerance: 1.5,
  budgetTolerance: 0.20, // 20%
  
  // Card quotas
  minLandCount: 35,
  maxLandCount: 38,
  minRampCount: 10,
  minDrawCount: 10,
  minRemovalCount: 8,
  
  // Quality
  minCardPrice: 0.10, // Filter cards under $0.10
  preferRareCards: true,
  
  // AI
  useAIValidation: true,
  aiValidationModel: 'google/gemini-2.5-flash',
  
  // Rules
  strictSingleton: true,
  
  // Debug
  verboseLogging: true
};

// Get config from environment or use defaults
export function getAdminConfig(): AdminConfig {
  try {
    const envConfig = Deno.env.get('AI_BUILDER_CONFIG');
    if (envConfig) {
      const parsed = JSON.parse(envConfig);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.log('Using default admin config');
  }
  return DEFAULT_CONFIG;
}
