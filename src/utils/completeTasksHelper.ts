import { supabase } from '@/integrations/supabase/client';

/**
 * Helper function to mark tasks as complete
 * Run this once to update the task statuses for completed work
 */
export async function markTasksComplete() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('Not authenticated');
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
    }
  ];

  for (const task of newCompletedTasks) {
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

  console.log('✅ All tasks updated!');
}

// Auto-run on import (for testing)
if (typeof window !== 'undefined') {
  (window as any).markTasksComplete = markTasksComplete;
  console.log('Task completion helper loaded. Run markTasksComplete() to update tasks.');
}
