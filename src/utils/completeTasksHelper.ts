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
      id: 'a2594e8a-74f1-42c4-b649-2460bc44a83d',
      title: 'Add bulk import validation'
    },
    {
      id: '04d4edb3-cead-4e48-b0e0-55118442280a',
      title: 'Fix card search in deck builder'
    },
    {
      id: 'af48fedc-d970-4d75-8912-bf6969e081a8',
      title: 'Add bulk card addition'
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
