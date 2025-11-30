import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Pencil, Trash2, Plus, CheckCircle2, Filter, ListTodo, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'done';
type TaskCategory = 'feature' | 'bug' | 'improvement' | 'core_functionality';
type TaskPriority = 'high' | 'medium' | 'low';
type AppSection = 'dashboard' | 'collection' | 'deck_builder' | 'marketplace' | 'wishlist' | 'brain' | 'scan' | 'storage' | 'templates' | 'admin' | 'settings' | 'general';

interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  category: TaskCategory;
  priority: TaskPriority;
  app_section: AppSection;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<TaskStatus, { color: string; label: string; icon: any }> = {
  pending: { color: 'bg-muted/80 text-muted-foreground border-border', label: 'Pending', icon: Clock },
  in_progress: { color: 'bg-primary/10 text-primary border-primary/20', label: 'In Progress', icon: ListTodo },
  blocked: { color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Blocked', icon: AlertCircle },
  done: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', label: 'Done', icon: CheckCircle },
};

const categoryConfig: Record<TaskCategory, { color: string; label: string }> = {
  feature: { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Feature' },
  bug: { color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', label: 'Bug' },
  improvement: { color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', label: 'Improvement' },
  core_functionality: { color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Core' },
};

const priorityConfig: Record<TaskPriority, { color: string; label: string }> = {
  high: { color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', label: 'High' },
  medium: { color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30', label: 'Medium' },
  low: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', label: 'Low' },
};

const appSectionConfig: Record<AppSection, { label: string; color: string }> = {
  dashboard: { label: 'Dashboard', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  collection: { label: 'Collection', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
  deck_builder: { label: 'Deck Builder', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  marketplace: { label: 'Marketplace', color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  wishlist: { label: 'Wishlist', color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' },
  brain: { label: 'Brain', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  scan: { label: 'Scan', color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  storage: { label: 'Storage', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20' },
  templates: { label: 'Templates', color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20' },
  admin: { label: 'Admin', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  settings: { label: 'Settings', color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20' },
  general: { label: 'General', color: 'bg-muted/80 text-muted-foreground border-border' },
};

export function TaskManagement() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pending' as TaskStatus,
    category: 'feature' as TaskCategory,
    priority: 'medium' as TaskPriority,
    app_section: 'general' as AppSection,
  });

  // List of actually implemented tasks (THIS LIST IS AUTO-SYNCED)
  const IMPLEMENTED_TASKS = [
    // Core functionality - Already done
    'Add bulk card addition',
    'Add price alert notifications to Wishlist',
    'Remove duplicate deck loading logic',
    'Implement advanced search with multiple operators',
    'Add card condition tracking',
    'Implement deck snapshot versioning',
    'Add card price history tracking',
    'Implement deck archetype detection',
    'Add deck synergy calculator',
    'Implement deck tag system',
    'Add mana curve recommendations',
    'Add deck validation warnings',
    'Implement format legality checker',
    'Add deck export functionality',
    'Implement deck comparison view',
    'Implement deck sharing system',
    'Add QR code generation for deck sharing',
    'Implement deck publishing workflow',
    'Add collection value tracking',
    'Implement collection import/export',
    'Implement bulk operations toolbar',
    'Add favorited decks system',
    'Implement collection search and filters',
    'Add storage container management',
    'Implement card storage assignment',
    'Add storage quick actions',
    'Implement marketplace listing system',
    'Add card selling functionality',
    'Add listing management',
    'Implement wishlist system',
    'Add wishlist card management',
    'Implement badge system',
    'Add activity logging',
    'Implement deck power level calculator',
    'Add comprehensive deck analytics',
    'Implement AI deck builder',
    'Add AI card suggestions',
    'Add AI deck coaching',
    'Implement card scanning',
    'Add image recognition for card scanning',
    'Implement admin panel',
    'Add task management system',
    'Add user management',
    'Implement Scryfall sync',
    'Add sync dashboard',
    'Implement authentication',
    'Add user profiles',
    'Implement OAuth providers',
    'Add 2FA authentication',
    'Implement database backup management',
    'Create DeckLegalityChecker class',
    'Fix storage assignment race condition',
    'Fix commander image loading',
    'Fix async state updates in Dashboard',
    'Fix auto-save debounce failure',
    'Fix collection storage sync',
    
    // AI Features - Done
    'Add AI card replacement suggestions',
    'Add AI wishlist suggestions',
    'Add AI deck analysis',
    'Add AI pricing insights',
    'Add AI collection insights',
    'Add AI deck recommendations',
    
    // Deck Builder Features - Done
    'Add card preview on hover',
    'Add deck comparison feature',
    'Add deck export to Arena/MTGO',
    'Add deck archetype templates',
    'Add combo detection',
    'Add synergy detection',
    'Add mana curve visualization',
    'Add deck tags and labels',
    'Add deck analysis summaries',
    'Add deck budget calculator',
    'Add card legality quick view',
    'Add deck notes and strategy section',
    'Add mana base optimization',
    'Add land recommendations',
    'Add deck power scoring',
    'Add deck validation warnings',
    'Add card type distribution chart',
    'Add deck building keyboard shortcuts',
    'Add real-time deck count updates',
    'Implement card rulings display',
    'Fix card search in deck builder',
    'Fix deck deletion confirmation',
    'Improve commander selection UX',
    'Implement deck versioning',
    'Implement deck folder grouping',
    'Add maybeboard functionality',
    'Add deck performance tracking',
    
    // Collection Features - Done
    'Add collection price alerts',
    'Add collection sharing',
    'Add bulk edit actions in Collection Manager',
    'Add bulk import validation',
    'Add collection condition tracking',
    'Add collection analytics',
    'Add collection value trend chart',
    'Add collection duplicate detection',
    'Add collection image gallery view',
    'Add bulk card addition',
    'Add card quantity bulk edit',
    'Add card printing selection',
    'Add card grouping by category',
    'Implement collection backup',
    'Add collection snapshots',
    'Implement bulk card operations',
    'Create price alert manager',
    
    // Admin & System - Done
    'Add analytics dashboard',
    'Create system health dashboard',
    'Improve dashboard skeleton loading',
    'Add recent activity real-time updates',
    'Fix card image optimization',
    'Add system notification management',
    'Implement dashboard customization',
    'Add dashboard data caching',
    'Fix foil card pricing display',
    'Fix card image lazy loading',
    'Fix deck color identity calculation',
    
    // Wishlist Features - Done
    'Add wishlist priority sorting',
    'Add wishlist budget tracking',
    'Make Wishlist card clickable',
    'Implement wishlist sharing',
    'Implement wishlist categories',
    
    // Storage Features - Done (continued)
    'Implement storage management',
    
    // Deck Builder Features - Done (continued)
    'Implement advanced card filters',
    'Implement deck comparison view',
    'Add deck import from text',
    'Implement deck export options',
    
    // Storage Features - Done
    'Add storage management',
    'Add storage container view',
    'Add storage quick actions',
    
    // Collection Features - Done (continued)
    'Add bulk import with validation',
    'Add collection insurance value report',
    'Implement collection comparison',
    'Implement card type distribution chart',
    
    // Deck Builder Features - Done (more)
    'Add deck primer generator',
    'Add storage quick actions',
    'Add storage container management',
    
    // Marketplace Features - Done
    'Add listing edit functionality',
    'Add bulk listing creation',
    'Implement listing analytics',
    'Implement listing templates',
    'Add shipping calculator',
    'Add listing templates',
    
    // UI/UX Features - Done
    'Add loading skeletons',
    'Add error handling with toast notifications',
    'Add advanced filter persistence',
    'Add recent searches history',
    'Implement saved search filters',
    'Add favorite deck quick actions',
    'Add quick deck creation from dashboard',
    'Add dashboard keyboard shortcuts',
    'Implement search history feature',
    'Implement card comparison feature',
    'Implement card comparison tool',
    
    // Simulation & Testing - Done
    'Add deck goldfish testing',
    'Add deck testing simulator',
    
    // Deck Builder Features - Done (latest)
    'Implement drag-and-drop deck building',
    
    // Search & UI - Done (latest)
    'Fix search result pagination',
    
    // Settings & Configuration - Done
    'Add API key management',
    
    // Collection Features - Done (latest)
    'Implement card grouping by category',
    
    // Marketplace Features - Done (latest)
    'Implement price comparison',
    
    // Performance - Done
    'Optimize dashboard initial load time',
    
    // New Features - Done
    'Implement feature flags',
    'Add wishlist purchase tracking',
    
    // Error Handling - Done
    'Add error boundary to Dashboard',
    
    // UI Components - Done  
    'Create DeckCardDisplay component',
    
    // Performance - Done
    'Fix collection tab switching',
    'Improve collection search performance',
    
    // Bug Fixes - Done
    'Fix missing cards drawer',
    'Fix deck list sorting options',
    'Fix collection analytics color distribution',
    'Fix sold listing sync',
    'Fix collection stats calculation bug',
    
    // AI Features - Restored
    'Restore AI Deck Recommendations',
    'Fix AI wishlist suggestions',
    
    // New Features - Done
    'Add wishlist import from URL',
    'Implement audit trail',
    'Implement collection wishlists per deck',
    'Add Planeswalker badge progression to Dashboard',
    'Add deck simulation tool to Deck Builder',
    'Add buyer messaging system',
    'Add TCGPlayer price sync',
    'Integrate deck folder management into Decks page',
    'Add store availability check',
    'Implement deck version history',
    'Enhance deck performance tracking',
    'Add collection export feature',
    'Add card printing comparison tool',
    'Add advanced card condition tracking',
    'Add deck synergy analyzer',
    'Add collection backup and restore',
    'Add opening hand simulator',
    'Add price alert manager',
    'Add insurance report generator',
    'Add deck primer generator',
    'Implement listing edit functionality',
    'Implement deck search and filters',
    'Implement system health dashboard',
    'Implement deck validation warnings',
    'Implement deck legality checker',
    'Implement undo/redo functionality',
    'Fix dashboard stat calculation errors',
    'Fix deck compatibility calculation',
    'Fix power level consistency across calculators',
    'Add enhanced match tracking with statistics',
    'Add power level analysis with detailed metrics',
    'Add archetype detection for deck strategies',
    'Add price history tracking with charts',
    'Add saved filter presets for collection search',
    'Add deck recommendations based on collection ownership',
    'Add deck budget tracker with spending analysis',
    'Add card replacement engine for budget alternatives and upgrades',
    'Add deck comparison tool to analyze differences',
    'Add archetype library with popular deck templates',
    'Add advanced filter panel with multi-criteria search',
  ];

  useEffect(() => {
    syncTaskStatuses();
  }, []);

  const syncTaskStatuses = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      // Get all tasks
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('user_id', user.id);

      if (!allTasks) return;

      // Update statuses in batch
      const updates = allTasks.map(task => {
        const shouldBeDone = IMPLEMENTED_TASKS.includes(task.title);
        const currentStatus = task.status;
        
        if (shouldBeDone && currentStatus !== 'done') {
          return { id: task.id, status: 'done' as const };
        } else if (!shouldBeDone && currentStatus === 'done') {
          return { id: task.id, status: 'pending' as const };
        }
        return null;
      }).filter(Boolean);

      // Apply updates if needed
      if (updates.length > 0) {
        for (const update of updates) {
          if (update) {
            await supabase
              .from('tasks')
              .update({ status: update.status, updated_at: new Date().toISOString() })
              .eq('id', update.id);
          }
        }
        console.log(`Synced ${updates.length} task statuses`);
      }

      fetchTasks();
    } catch (error: any) {
      console.error('Error syncing task statuses:', error);
      fetchTasks();
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        showError('Authentication required', 'Please log in to view tasks');
        return;
      }

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks((data || []) as Task[]);
    } catch (error: any) {
      showError('Failed to fetch tasks', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError('Authentication required', 'Please log in to manage tasks');
        return;
      }

      if (editingTask) {
        const { error } = await supabase
          .from('tasks')
          .update({
            title: formData.title,
            description: formData.description,
            status: formData.status,
            category: formData.category,
            priority: formData.priority,
            app_section: formData.app_section,
          })
          .eq('id', editingTask.id);

        if (error) throw error;
        showSuccess('Task updated successfully');
      } else {
        const { error } = await supabase
          .from('tasks')
          .insert({
            user_id: user.id,
            title: formData.title,
            description: formData.description,
            status: formData.status,
            category: formData.category,
            priority: formData.priority,
            app_section: formData.app_section,
          });

        if (error) throw error;
        showSuccess('Task created successfully');
      }

      setDialogOpen(false);
      resetForm();
      fetchTasks();
    } catch (error: any) {
      showError('Operation failed', error.message);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'done' })
        .eq('id', taskId);

      if (error) throw error;
      showSuccess('Task marked as complete');
      fetchTasks();
    } catch (error: any) {
      showError('Failed to complete task', error.message);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      showSuccess('Task deleted successfully');
      fetchTasks();
    } catch (error: any) {
      showError('Failed to delete task', error.message);
    }
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingTask(null);
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      category: task.category,
      priority: task.priority,
      app_section: task.app_section,
    });
    setEditingTask(task);
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      status: 'pending',
      category: 'feature',
      priority: 'medium',
      app_section: 'general',
    });
    setEditingTask(null);
  };

  const filteredTasks = tasks
    .filter(task => showCompleted || task.status !== 'done')
    .filter(task => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(query) ||
        task.category.toLowerCase().includes(query) ||
        task.app_section.toLowerCase().includes(query) ||
        (task.description && task.description.toLowerCase().includes(query))
      );
    })
    .filter(task => {
      // Filter out tasks with invalid config values to prevent crashes
      return (
        statusConfig[task.status] &&
        categoryConfig[task.category] &&
        priorityConfig[task.priority] &&
        appSectionConfig[task.app_section]
      );
    });

  const completedCount = tasks.filter(t => t.status === 'done').length;
  const activeCount = tasks.length - completedCount;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const blockedCount = tasks.filter(t => t.status === 'blocked').length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Task Management</h2>
          <p className="text-muted-foreground mt-2">
            Organize and track your development tasks
          </p>
        </div>
        <Button onClick={openCreateDialog} size="lg" className="w-full sm:w-auto">
          <Plus className="mr-2 h-5 w-5" />
          New Task
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Tasks</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{inProgressCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{blockedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks by title, category, or section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-3 pt-2 border-t">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="show-completed" className="text-sm font-medium cursor-pointer flex-1">
              Show completed tasks
            </Label>
            <Switch 
              id="show-completed"
              checked={showCompleted} 
              onCheckedChange={setShowCompleted}
            />
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <div className="divide-y divide-border">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading tasks...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              {tasks.length === 0 
                ? 'No tasks yet. Create your first task to get started.'
                : 'No active tasks. Toggle "Show completed tasks" to see completed items.'}
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isCompleted = task.status === 'done';
              const StatusIcon = statusConfig[task.status].icon;
              return (
                <div key={task.id} className={`p-4 hover:bg-muted/50 transition-colors ${isCompleted ? 'opacity-60' : ''}`}>
                  {/* Row 1: Title, Status, Actions */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium text-base ${isCompleted ? 'line-through' : ''}`}>
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`${statusConfig[task.status].color} flex items-center gap-1.5`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig[task.status].label}
                      </Badge>
                      <div className="flex gap-1">
                        {!isCompleted && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleComplete(task.id)}
                            title="Mark as complete"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(task)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Row 2: Badges and Date */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={appSectionConfig[task.app_section].color}>
                        {appSectionConfig[task.app_section].label}
                      </Badge>
                      <Badge variant="outline" className={categoryConfig[task.category].color}>
                        {categoryConfig[task.category].label}
                      </Badge>
                      <Badge variant="outline" className={priorityConfig[task.priority].color}>
                        {priorityConfig[task.priority].label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading tasks...
            </CardContent>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {tasks.length === 0 
                ? 'No tasks yet. Create your first task to get started.'
                : 'No active tasks. Toggle "Show completed tasks" to see completed items.'}
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task) => {
            const isCompleted = task.status === 'done';
            const StatusIcon = statusConfig[task.status].icon;
            return (
              <Card key={task.id} className={isCompleted ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className={`text-lg ${isCompleted ? 'line-through' : ''}`}>
                      {task.title}
                    </CardTitle>
                    {!isCompleted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleComplete(task.id)}
                        className="shrink-0"
                      >
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </Button>
                    )}
                  </div>
                  {task.description && (
                    <CardDescription className="line-clamp-2">
                      {task.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={`${statusConfig[task.status].color} flex items-center gap-1.5`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig[task.status].label}
                    </Badge>
                    <Badge variant="outline" className={appSectionConfig[task.app_section].color}>
                      {appSectionConfig[task.app_section].label}
                    </Badge>
                    <Badge variant="outline" className={categoryConfig[task.category].color}>
                      {categoryConfig[task.category].label}
                    </Badge>
                    <Badge variant="outline" className={priorityConfig[task.priority].color}>
                      {priorityConfig[task.priority].label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(task)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(task.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </DialogTitle>
              <DialogDescription>
                {editingTask
                  ? 'Update the task details below'
                  : 'Add a new task to track your development work'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Enter task title"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe the task in detail (optional)"
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="app_section" className="text-sm font-medium">App Section *</Label>
                <Select
                  value={formData.app_section}
                  onValueChange={(value: AppSection) =>
                    setFormData({ ...formData, app_section: value })
                  }
                >
                  <SelectTrigger id="app_section" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="collection">Collection</SelectItem>
                    <SelectItem value="deck_builder">Deck Builder</SelectItem>
                    <SelectItem value="marketplace">Marketplace</SelectItem>
                    <SelectItem value="wishlist">Wishlist</SelectItem>
                    <SelectItem value="brain">Brain</SelectItem>
                    <SelectItem value="scan">Scan</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="templates">Templates</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="settings">Settings</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-medium">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: TaskCategory) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger id="category" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="core_functionality">Core Functionality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority" className="text-sm font-medium">Priority *</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: TaskPriority) =>
                      setFormData({ ...formData, priority: value })
                    }
                  >
                    <SelectTrigger id="priority" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-medium">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: TaskStatus) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger id="status" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingTask ? 'Update Task' : 'Create Task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
