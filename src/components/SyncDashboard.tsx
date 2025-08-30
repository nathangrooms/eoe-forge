import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  RefreshCw, 
  Play, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Database,
  Activity,
  Download,
  Zap,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SyncStatus {
  id: string;
  status: string;
  error_message?: string;
  records_processed: number;
  total_records: number;
  last_sync?: string;
}

const SyncDashboard = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isTestingAPI, setIsTestingAPI] = useState(false);
  const [cardCount, setCardCount] = useState(0);
  const { toast } = useToast();

  const loadSyncStatus = async () => {
    try {
      // Get sync status
      const { data: statusData, error: statusError } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .single();

      if (statusError && statusError.code !== 'PGRST116') {
        console.error('Error loading sync status:', statusError);
      } else {
        setSyncStatus(statusData);
      }

      // Get card count
      const { count, error: countError } = await supabase
        .from('cards')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error loading card count:', countError);
      } else {
        setCardCount(count || 0);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerSync = async () => {
    setIsTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('scryfall-sync', {
        body: { action: 'sync' }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Sync Triggered",
        description: "Card synchronization has been started. This may take several minutes.",
      });

      // Refresh status after a short delay
      setTimeout(loadSyncStatus, 2000);
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      toast({
        title: "Sync Failed",
        description: `Failed to start sync: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsTriggering(false);
    }
  };

  const testScryfallAPI = async () => {
    setIsTestingAPI(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-scryfall');

      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: "API Test Successful",
          description: "Scryfall API is accessible and working correctly.",
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('API test failed:', error);
      toast({
        title: "API Test Failed",
        description: `Scryfall API test failed: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsTestingAPI(false);
    }
  };

  const resetSyncStatus = async () => {
    try {
      const { error } = await supabase
        .from('sync_status')
        .upsert({
          id: 'scryfall_cards',
          status: 'pending',
          error_message: null,
          records_processed: 0,
          total_records: 0,
          last_sync: null
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Status Reset",
        description: "Sync status has been reset to pending.",
      });

      loadSyncStatus();
    } catch (error) {
      console.error('Failed to reset status:', error);
      toast({
        title: "Reset Failed",
        description: `Failed to reset status: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadSyncStatus();
    
    // Auto-refresh every 30 seconds if sync is running
    const interval = setInterval(() => {
      if (syncStatus?.status === 'running') {
        loadSyncStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [syncStatus?.status]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'running':
        return <Activity className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'running':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatLastSync = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const calculateProgress = () => {
    if (!syncStatus) return 0;
    if (syncStatus.total_records === 0) {
      // If we're running but don't have total count yet, show indeterminate progress
      return syncStatus.status === 'running' ? -1 : 0;
    }
    return Math.round((syncStatus.records_processed / syncStatus.total_records) * 100);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Card Sync Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and manage Magic: The Gathering card database synchronization
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSyncStatus}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={triggerSync}
            disabled={isTriggering || syncStatus?.status === 'running'}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isTriggering ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Starting Sync...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Full Sync
              </>
            )}
          </Button>
          {syncStatus?.status === 'running' && (
            <Button
              onClick={resetSyncStatus}
              variant="outline"
              size="sm"
              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              Stop Sync
            </Button>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
            {syncStatus && getStatusIcon(syncStatus.status)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {syncStatus ? (
                <Badge variant="outline" className={getStatusColor(syncStatus.status)}>
                  {syncStatus.status.toUpperCase()}
                </Badge>
              ) : (
                'Unknown'
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Last updated: {formatLastSync(syncStatus?.last_sync)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cards in Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cardCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total unique cards available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sync Progress</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {syncStatus ? `${calculateProgress()}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              {syncStatus 
                ? `${syncStatus.records_processed.toLocaleString()} / ${syncStatus.total_records.toLocaleString()}`
                : 'No active sync'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      {syncStatus && syncStatus.status === 'running' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-blue-500 animate-pulse" />
              Sync in Progress
            </CardTitle>
            <CardDescription>
              {syncStatus.total_records > 0 
                ? "Downloading and processing cards from Scryfall API"
                : "Initializing sync and connecting to Scryfall API..."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncStatus.total_records > 0 ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{calculateProgress()}%</span>
                  </div>
                  <Progress value={calculateProgress()} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{syncStatus.records_processed.toLocaleString()} processed</span>
                    <span>{syncStatus.total_records.toLocaleString()} total</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span>Status</span>
                    <span>Initializing...</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Setting up streaming download and card processing
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {syncStatus?.status === 'failed' && syncStatus.error_message && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Sync Failed:</strong> {syncStatus.error_message}
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={resetSyncStatus}>
                Reset Status
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Stuck Sync Alert */}
      {syncStatus?.status === 'running' && syncStatus.last_sync && 
       new Date().getTime() - new Date(syncStatus.last_sync).getTime() > 3600000 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Sync appears stuck:</strong> The sync has been running for over an hour without progress.
            This may indicate a connection issue or edge function timeout.
            <div className="mt-2 space-x-2">
              <Button variant="outline" size="sm" onClick={resetSyncStatus}>
                Reset Status
              </Button>
              <Button variant="outline" size="sm" onClick={triggerSync}>
                Restart Sync
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Detailed Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Zap className="h-5 w-5 mr-2" />
            Sync Details
          </CardTitle>
          <CardDescription>
            Detailed information about the current sync status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Current Status</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-mono">{syncStatus?.status || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync:</span>
                  <span className="font-mono">{formatLastSync(syncStatus?.last_sync)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Records Processed:</span>
                  <span className="font-mono">{syncStatus?.records_processed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Records:</span>
                  <span className="font-mono">{syncStatus?.total_records || 0}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Database Stats</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Cards in DB:</span>
                  <span className="font-mono">{cardCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Updated:</span>
                  <span className="font-mono">
                    {syncStatus?.last_sync ? new Date(syncStatus.last_sync).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {syncStatus?.error_message && (
            <>
              <Separator className="my-4" />
              <div>
                <h4 className="font-semibold mb-2 text-red-600">Error Details</h4>
                <div className="bg-red-50 dark:bg-red-950 p-3 rounded-md">
                  <code className="text-sm">{syncStatus.error_message}</code>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Actions</CardTitle>
          <CardDescription>
            Use these actions to manually manage the sync process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={testScryfallAPI}
              disabled={isTestingAPI}
            >
              {isTestingAPI ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing API...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Test Scryfall API
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={triggerSync}
              disabled={isTriggering || syncStatus?.status === 'running'}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Full Sync
            </Button>
            <Button
              variant="outline"
              onClick={resetSyncStatus}
              disabled={syncStatus?.status === 'running'}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Status
            </Button>
            <Button
              variant="outline"
              onClick={loadSyncStatus}
            >
              <Database className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SyncDashboard;