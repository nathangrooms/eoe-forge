import { supabase } from '@/integrations/supabase/client';

/**
 * Cleanup utility to remove duplicate completed tasks
 * This should be run once to clean up the database
 */
export async function cleanupDuplicateTasks() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('Not authenticated');
    return { success: false, message: 'Not authenticated' };
  }

  try {
    // Fetch all tasks for the user
    const { data: allTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    if (!allTasks) {
      return { success: true, message: 'No tasks found', deletedCount: 0 };
    }

    console.log(`Found ${allTasks.length} total tasks`);

    // Group tasks by title
    const tasksByTitle = new Map<string, any[]>();
    for (const task of allTasks) {
      if (!tasksByTitle.has(task.title)) {
        tasksByTitle.set(task.title, []);
      }
      tasksByTitle.get(task.title)!.push(task);
    }

    // Find duplicates (keep the oldest one, delete the rest)
    const tasksToDelete: string[] = [];
    for (const [title, tasks] of tasksByTitle.entries()) {
      if (tasks.length > 1) {
        console.log(`Found ${tasks.length} duplicates of "${title}"`);
        // Keep the first one (oldest), delete the rest
        const toDelete = tasks.slice(1).map(t => t.id);
        tasksToDelete.push(...toDelete);
      }
    }

    if (tasksToDelete.length === 0) {
      console.log('No duplicate tasks found');
      return { success: true, message: 'No duplicates found', deletedCount: 0 };
    }

    console.log(`Deleting ${tasksToDelete.length} duplicate tasks...`);

    // Delete duplicates in batches
    const batchSize = 50;
    let deletedCount = 0;
    
    for (let i = 0; i < tasksToDelete.length; i += batchSize) {
      const batch = tasksToDelete.slice(i, i + batchSize);
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .in('id', batch)
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('Error deleting batch:', deleteError);
        throw deleteError;
      }
      
      deletedCount += batch.length;
      console.log(`Deleted ${deletedCount}/${tasksToDelete.length} tasks`);
    }

    console.log(`✅ Cleanup complete! Deleted ${deletedCount} duplicate tasks`);
    
    return {
      success: true,
      message: `Successfully deleted ${deletedCount} duplicate tasks`,
      deletedCount
    };
  } catch (error: any) {
    console.error('Error during cleanup:', error);
    return {
      success: false,
      message: error.message || 'Unknown error',
      deletedCount: 0
    };
  }
}

// Make it available in browser console for testing
if (typeof window !== 'undefined') {
  (window as any).cleanupDuplicateTasks = cleanupDuplicateTasks;
  console.log('Cleanup utility loaded. Run cleanupDuplicateTasks() to remove duplicates.');
}
