import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SyncStatus {
  id: string;
  last_sync: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message: string | null;
  records_processed: number;
  total_records: number;
}

export function AdminPanel() {
  const { toast } = useToast();

  const { data: syncStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .order('id');
      
      if (error) throw error;
      return data as SyncStatus[];
    },
    refetchInterval: 5000, // Refetch every 5 seconds when sync is running
  });

  const { data: cardStats } = useQuery({
    queryKey: ['card-stats'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('cards')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return { totalCards: count || 0 };
    },
  });

  const { data: userStats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const { count: profileCount, error: profileError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      const { count: deckCount, error: deckError } = await supabase
        .from('user_decks')
        .select('*', { count: 'exact', head: true });
      
      if (profileError || deckError) throw profileError || deckError;
      
      return { 
        totalUsers: profileCount || 0,
        totalDecks: deckCount || 0
      };
    },
  });

  const startSync = async () => {
    try {
      const { error } = await supabase.functions.invoke('scryfall-sync', {
        body: { action: 'sync' }
      });
      
      if (error) throw error;
      
      toast({
        title: "Sync Started",
        description: "Card synchronization has been initiated.",
      });
      
      refetchStatus();
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground">
          Manage the MTG Deckbuilder platform
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Cards</p>
              <p className="text-2xl font-bold">
                {cardStats?.totalCards.toLocaleString() || '0'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-sm font-bold">👥</span>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold">
                {userStats?.totalUsers.toLocaleString() || '0'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 text-sm font-bold">🃏</span>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Decks</p>
              <p className="text-2xl font-bold">
                {userStats?.totalDecks.toLocaleString() || '0'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sync Status */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Data Synchronization</h2>
          <Button onClick={startSync} disabled={syncStatus?.some(s => s.status === 'running')}>
            <Download className="h-4 w-4 mr-2" />
            Sync Cards
          </Button>
        </div>

        <div className="space-y-4">
          {syncStatus?.map((status) => (
            <div key={status.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(status.status)}
                  <span className="font-medium capitalize">
                    {status.id.replace('_', ' ')}
                  </span>
                </div>
                <Badge className={getStatusColor(status.status)}>
                  {status.status}
                </Badge>
              </div>

              {status.last_sync && (
                <p className="text-sm text-muted-foreground mb-2">
                  Last sync: {new Date(status.last_sync).toLocaleString()}
                </p>
              )}

              {status.status === 'running' && status.total_records > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{status.records_processed.toLocaleString()} / {status.total_records.toLocaleString()}</span>
                  </div>
                  <Progress 
                    value={(status.records_processed / status.total_records) * 100} 
                    className="w-full"
                  />
                </div>
              )}

              {status.status === 'completed' && status.total_records > 0 && (
                <p className="text-sm text-green-600">
                  Successfully processed {status.records_processed.toLocaleString()} records
                </p>
              )}

              {status.status === 'failed' && status.error_message && (
                <p className="text-sm text-red-600">
                  Error: {status.error_message}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}