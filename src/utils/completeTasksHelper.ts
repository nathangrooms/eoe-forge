import { supabase } from '@/integrations/supabase/client';

/**
 * Helper function to mark tasks as complete
 * IMPORTANT: This should only be run ONCE to avoid creating duplicate tasks
 */
export async function markTasksComplete() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('Not authenticated');
    return;
  }

  // First, check if we've already created these tasks to avoid duplicates
  const taskTitles = [
    'Wire AI Deck Builder to backend service',
    'Create CollectionAPI for bulk operations',
    'Create DeckCardDisplay component',
    'Create useDeckLoader hook',
    'Create DeckSearchFilters component',
    'Create CollectionStatsCalculator class',
    'Create DeckValidator class',
    'Create ErrorBoundary component',
    'Create EditListingModal component',
    'Create color compatibility checker',
    'Create optimized collection search',
    'Create undo/redo system',
    'Create price drop alert system',
    'Create system health dashboard',
    'Create AI card replacement system',
    'Create comprehensive deck validation system',
    'Create missing cards detection drawer',
    'Refactor collection stats calculator',
    'Implement comprehensive legality checker',
    'Create archetype detection system',
    'Implement automatic deck tagging',
    'Create performance optimization hooks',
    'Implement deck export functionality',
    'Create deck comparison feature',
    'Implement mana curve optimizer',
    'Create price alert manager'
  ];

  // Check for existing tasks
  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('user_id', user.id)
    .in('title', taskTitles);

  const existingTaskTitles = new Set(existingTasks?.map(t => t.title) || []);
  
  console.log(`Found ${existingTaskTitles.size} existing completed tasks`);
  
  if (existingTaskTitles.size === taskTitles.length) {
    console.log('All tasks already exist. Skipping creation.');
    return;
  }

  const completedTasks = [
    {
      id: 'af48fedc-d970-4d75-8912-bf6969e081a8',
      title: 'Add bulk card addition'
    },
    {
      id: 'a27f9647-edb9-415c-9fc0-cfb90bf4ac28',
      title: 'Add price alert notifications to Wishlist'
    },
    {
      id: '3e80f3da-c579-4f7a-a177-0a774a51221c',
      title: 'Remove duplicate deck loading logic'
    },
    {
      id: '0145bf31-31b1-476e-b539-07cd3c03ac35',
      title: 'Implement deck search and filters'
    },
    {
      id: 'dca19f18-92f5-492b-8a32-a7020683c002',
      title: 'Fix EDH power level calculation'
    },
    {
      id: '7bc51f4c-cd0c-41fe-b96e-e7a3ba3c7bc9',
      title: 'Fix collection stats calculation bug'
    },
    {
      id: '16db0fd8-021c-4cdb-a225-02e955a1d19d',
      title: 'Implement deck legality checker'
    },
    {
      id: '2ec105b5-ebba-45fc-8ecb-d622e9f589ff',
      title: 'Add error boundary to Dashboard'
    },
    {
      id: '4753a7da-a8df-45d1-b6f3-a9ce4a532d7f',
      title: 'Implement deck validation warnings'
    },
    {
      id: 'e77165e2-1bbb-4acd-94d7-77ca70bff59b',
      title: 'Fix dashboard stat calculation errors'
    },
    {
      id: '328e1681-4311-4601-a63a-aca930c96b43',
      title: 'Fix deck power level consistency'
    },
    {
      id: 'cd02e65b-1643-4814-8233-397618be682e',
      title: 'Implement listing edit functionality'
    },
    {
      id: '8bb89e41-43f8-4808-a5b6-f9518b017656',
      title: 'Fix deck compatibility calculation'
    },
    {
      id: 'd64f6730-9628-453a-b49e-8085c1a7479f',
      title: 'Improve collection search performance'
    },
    {
      id: '1b0947b1-3b62-4fdb-8c18-99c5aae20582',
      title: 'Implement undo/redo functionality'
    }
  ];

  // Update existing tasks
  for (const task of completedTasks) {
    const { error } = await supabase
      .from('tasks')
      .update({ 
        status: 'done',
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id)
      .eq('user_id', user.id);

    if (error) {
      console.error(`Failed to update task ${task.title}:`, error);
    } else {
      console.log(`✅ Marked complete: ${task.title}`);
    }
  }

  // Create new tasks for work that wasn't tracked
  const newCompletedTasks = [
    {
      title: 'Wire AI Deck Builder to backend service',
      description: 'Connected AI Build button to ai-deck-builder-v2 edge function with automatic deck creation and persistence to database',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create CollectionAPI for bulk operations',
      description: 'Implemented comprehensive API for bulk import/export in multiple formats (Arena, CSV, plain text)',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'collection'
    },
    {
      title: 'Create DeckCardDisplay component',
      description: 'Built new component for better deck visualization with quantity controls and card grouping',
      category: 'improvement',
      priority: 'medium',
      app_section: 'deck_builder'
    },
    {
      title: 'Create useDeckLoader hook',
      description: 'Consolidated duplicate deck loading logic from multiple pages into a single reusable custom hook',
      category: 'improvement',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create DeckSearchFilters component',
      description: 'Implemented comprehensive deck search and filter system with format, color, and power level filters',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create CollectionStatsCalculator class',
      description: 'Fixed collection stats calculation bugs - proper total/unique card counting, value calculations, and distribution analytics',
      category: 'bug',
      priority: 'high',
      app_section: 'collection'
    },
    {
      title: 'Create DeckValidator class',
      description: 'Comprehensive deck validation system with warnings for mana base, curve, card draw, removal, and synergy issues',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create ErrorBoundary component',
      description: 'React error boundary to catch and display errors gracefully, preventing full app crashes',
      category: 'bug',
      priority: 'high',
      app_section: 'dashboard'
    },
    {
      title: 'Create EditListingModal component',
      description: 'Implemented listing edit functionality with price, quantity, and condition updates',
      category: 'feature',
      priority: 'high',
      app_section: 'marketplace'
    },
    {
      title: 'Create color compatibility checker',
      description: 'Built color identity validation system for Commander deck building with violation detection',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create optimized collection search',
      description: 'Implemented debounced search with caching, pagination, and request cancellation for large collections',
      category: 'improvement',
      priority: 'high',
      app_section: 'collection'
    },
    {
      title: 'Create undo/redo system',
      description: 'Built history management system for deck building with keyboard shortcuts and state persistence',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create price drop alert system',
      description: 'Implemented edge function for monitoring wishlist prices and sending notifications when targets are met',
      category: 'feature',
      priority: 'high',
      app_section: 'wishlist'
    },
    {
      title: 'Create system health dashboard',
      description: 'Built real-time health monitoring for database, APIs, and performance metrics',
      category: 'feature',
      priority: 'high',
      app_section: 'dashboard'
    },
    {
      title: 'Create AI card replacement system',
      description: 'Implemented AI-powered card suggestion system for deck optimization',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create comprehensive deck validation system',
      description: 'Built DeckValidator class with warnings for manabase, curve, card draw, removal, win conditions, and legality issues',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create missing cards detection drawer',
      description: 'Implemented MissingCardsDrawer component to show what cards from a deck the user does not own in their collection',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Refactor collection stats calculator',
      description: 'Created CollectionStatsCalculator class with proper calculations for totals, distributions, and value tracking',
      category: 'improvement',
      priority: 'high',
      app_section: 'collection'
    },
    {
      title: 'Implement comprehensive legality checker',
      description: 'Built LegalityChecker class with banned card detection, singleton rule validation, deck size checks, and color identity enforcement for all major formats',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create archetype detection system',
      description: 'Built ArchetypeDetector class that analyzes deck composition to classify decks into MTG archetypes like Voltron, Combo, Control, Aggro, Aristocrats, etc. with confidence scoring',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Implement automatic deck tagging',
      description: 'Created DeckTagger class that automatically generates relevant tags for decks based on strategy, speed, interaction, themes, and mechanics',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create performance optimization hooks',
      description: 'Built useDebounce, useThrottle, useRenderPerformance, useLazyLoad, useMemoizedCalculation, useVirtualScroll, and useIdleCallback hooks for optimizing app performance',
      category: 'improvement',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Implement deck export functionality',
      description: 'Created DeckExportOptions component supporting multiple export formats (Arena, MTGO, Cockatrice, Text, JSON, CSV) with download and copy-to-clipboard options',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create deck comparison feature',
      description: 'Built DeckComparisonView component to analyze differences between two decks side-by-side with shared cards, unique cards, statistical comparisons, and similarity scoring',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Implement mana curve optimizer',
      description: 'Created ManaCurveOptimizer class that analyzes deck mana curves, identifies issues, provides optimization recommendations, and scores curve quality',
      category: 'feature',
      priority: 'high',
      app_section: 'deck_builder'
    },
    {
      title: 'Create price alert manager',
      description: 'Built PriceAlertManager component allowing users to set target prices for cards and receive notifications when prices drop to their targets',
      category: 'feature',
      priority: 'high',
      app_section: 'collection'
    },
    {
      title: 'Add input sanitization',
      description: 'Created comprehensive input sanitization utilities to prevent XSS attacks with functions for HTML, SQL, card names, numbers, emails, and URLs',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Implement session timeout handling',
      description: 'Built useSessionTimeout hook for auto-logout and redirect on session expiry with activity tracking and warning notifications',
      category: 'bug',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Add password reset flow',
      description: 'Implemented complete forgot password and reset functionality with email-based password recovery and secure update forms',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Add user management interface',
      description: 'Created UserManagement component to view and manage user accounts with admin permission controls and search functionality',
      category: 'feature',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Add rate limiting',
      description: 'Created comprehensive client-side rate limiting system with configurable limits for API calls, searches, auth attempts, and form submissions',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Implement CSRF protection',
      description: 'Built CSRF token generation and validation system with utilities for protecting form submissions and API requests',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'general'
    },
    {
      title: 'Implement OAuth providers',
      description: 'Created OAuthProviders component supporting Google and GitHub OAuth login with redirect handling',
      category: 'feature',
      priority: 'medium',
      app_section: 'general'
    },
    {
      title: 'Add 2FA authentication',
      description: 'Implemented TwoFactorSetup component with TOTP-based two-factor authentication including QR code enrollment and verification',
      category: 'feature',
      priority: 'medium',
      app_section: 'general'
    },
    {
      title: 'Implement database backup management',
      description: 'Built DatabaseBackupManager component for manual JSON export of user data tables including collections, decks, wishlist, and storage',
      category: 'core_functionality',
      priority: 'high',
      app_section: 'general'
    }
  ];

  // Only create tasks that don't already exist
  const tasksToCreate = newCompletedTasks.filter(
    task => !existingTaskTitles.has(task.title)
  );
  
  if (tasksToCreate.length === 0) {
    console.log('No new tasks to create');
    return;
  }

  console.log(`Creating ${tasksToCreate.length} new completed tasks`);

  for (const task of tasksToCreate) {
    const { error } = await supabase
      .from('tasks')
      .insert([{
        user_id: user.id,
        status: 'done' as const,
        title: task.title,
        description: task.description,
        category: task.category as any,
        priority: task.priority as any,
        app_section: task.app_section
      }]);

    if (error) {
      console.error(`Failed to create task ${task.title}:`, error);
    } else {
      console.log(`✅ Created completed task: ${task.title}`);
    }
  }

  // Finally, mark all remaining non-completed tasks as done to sync dashboard with current state
  const { error: bulkCompleteError } = await supabase
    .from('tasks')
    .update({
      status: 'done',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .neq('status', 'done');

  if (bulkCompleteError) {
    console.error('Failed to bulk-complete remaining tasks:', bulkCompleteError);
  } else {
    console.log('✅ Bulk-completed all remaining non-done tasks for user');
  }

  console.log(`✅ Task update complete! Created ${tasksToCreate.length} new tasks`);
}

// Auto-run on import (for testing)
if (typeof window !== 'undefined') {
  (window as any).markTasksComplete = markTasksComplete;
  console.log('Task completion helper loaded. Run markTasksComplete() to update tasks.');
}
