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

  useEffect(() => {
    fetchTasks();
  }, []);

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
