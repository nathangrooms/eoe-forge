import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  current_step?: string;
  step_progress?: number;
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
      setIsLoading(true);
      console.log('📊 Loading sync status...');
      
      // Get sync status - use maybeSingle to avoid errors when no data
      const { data: statusData, error: statusError } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .maybeSingle();

      if (statusError) {
        console.warn('Error loading sync status:', statusError);
        // Don't throw - just log and continue with null status
      }

      console.log('📋 Sync status loaded:', statusData);
      setSyncStatus(statusData);

      // Get card count
      const { count, error: countError } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true });

      if (countError) {
        console.warn('Error loading card count:', countError);
      } else {
        setCardCount(count || 0);
      }
    } catch (error: any) {
      console.error('Failed to load data:', error);
      // Don't show toast on initial load errors - just log
    } finally {
      setIsLoading(false);
    }
  };

  const triggerSync = async () => {
    setIsTriggering(true);
    try {
      console.log('🚀 Triggering sync...');
      
      const { data, error } = await supabase.functions.invoke('scryfall-sync', {
        body: { action: 'sync' }
      });

      console.log('🔄 Sync response:', data);

      if (error) {
        console.error('Sync invoke error:', error);
        // Handle the specific 409 conflict error more gracefully
        if (error.message?.includes('non-2xx status code')) {
          toast({
            title: "Sync Already Running",
            description: "A sync is already in progress. Please wait for it to complete or reset if stuck.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Handle conflict responses from the edge function
      if (data?.status === 'running' && data?.message?.includes('already running')) {
        toast({
          title: "Sync Already Running",
          description: "A sync is already in progress. Please wait for it to complete or reset if stuck.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sync Started",
        description: "Card synchronization has been started. Monitor progress below.",
      });

      // Start polling for status updates every 3 seconds
      const pollInterval = setInterval(async () => {
        await loadSyncStatus();
        
        // Stop polling if sync is no longer running
        if (syncStatus && syncStatus.status !== 'running') {
          clearInterval(pollInterval);
        }
      }, 3000);

      // Stop polling after 30 minutes maximum
      setTimeout(() => clearInterval(pollInterval), 30 * 60 * 1000);

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

  const testSimpleSync = async () => {
    setIsTriggering(true);
    try {
      console.log('🧪 Testing simple sync...');
      
      const { data, error } = await supabase.functions.invoke('simple-sync');

      console.log('🔄 Simple sync response:', data);

      if (error) {
        console.error('Simple sync invoke error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Test Sync Completed",
        description: `Successfully synced ${data?.processed || 0} test cards.`,
      });

      // Refresh status immediately
      setTimeout(loadSyncStatus, 1000);
      
    } catch (error) {
      console.error('Failed to test simple sync:', error);
      toast({
        title: "Test Sync Failed",
        description: `Failed to run test sync: ${error.message}`,
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
    setIsTriggering(true); // Show loading state
    try {
      console.log('🔄 Force resetting sync status...');
      
      // First try to stop the sync if it's running
      if (syncStatus?.status === 'running') {
        const { error: stopError } = await supabase.functions.invoke('scryfall-sync', {
          body: { action: 'stop' }
        });
        
        if (stopError) {
          console.warn('Failed to stop sync gracefully:', stopError);
        }
      }
      
      // Force reset the sync status
      const { error } = await supabase
        .from('sync_status')
        .upsert({
          id: 'scryfall_cards',
          status: 'pending',
          error_message: 'Manually reset by user',
          records_processed: 0,
          total_records: 0,
          last_sync: new Date().toISOString()
        });

      if (error) {
        console.error('Reset error:', error);
        throw error;
      }

      toast({
        title: "Sync Reset",
        description: "Sync has been stopped and reset. You can now start a new sync.",
      });

      // Force immediate visual update
      setSyncStatus({
        id: 'scryfall_cards',
        status: 'pending',
        error_message: 'Manually reset by user',
        records_processed: 0,
        total_records: 0,
        last_sync: new Date().toISOString()
      });

      // Refresh status after UI update
      setTimeout(loadSyncStatus, 500);
    } catch (error) {
      console.error('Failed to reset sync:', error);
      toast({
        title: "Reset Failed", 
        description: `Failed to reset sync: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    loadSyncStatus();
  }, []);

  // Smart polling that only runs when needed and stops refresh loops
  useEffect(() => {
    if (!syncStatus || syncStatus.status !== 'running') return;
    
    const interval = setInterval(() => {
      loadSyncStatus();
    }, 5000); // 5 second polls only when running

    return () => clearInterval(interval);
  }, [syncStatus?.status]); // Only depend on status change, not the whole object

  /**
   * Status reads through weight and surface, not hue. This panel used raw
   * green/blue/red/grey palette classes for the four states and a saturated
   * blue status pill; in this product a colour means a Magic colour, and sync
   * state is not one. The single exception is failure, which is exactly what
   * the destructive token exists for.
   */
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-foreground" />;
      case 'running':
        return <Activity className="h-5 w-5 animate-pulse text-foreground motion-reduce:animate-none" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'failed':
        return 'bg-destructive/15 text-destructive';
      case 'completed':
      case 'running':
        return 'bg-foreground text-background';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const formatLastSync = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const calculateProgress = () => {
    if (!syncStatus) return 0;
    if (syncStatus.total_records === 0 || syncStatus.status !== 'running') {
      return syncStatus.status === 'completed' ? 100 : 0;
    }
    return Math.min(100, Math.round((syncStatus.records_processed / syncStatus.total_records) * 100));
  };

  const getSyncSteps = () => {
    return [
      { id: 'init', name: 'Initialize Sync', status: 'completed' },
      { id: 'fetch', name: 'Fetch Bulk Data Info', status: syncStatus?.current_step === 'fetch' ? 'current' : syncStatus?.step_progress >= 1 ? 'completed' : 'pending' },
      { id: 'download', name: 'Download & Process Cards', status: syncStatus?.current_step === 'download' ? 'current' : syncStatus?.step_progress >= 3 ? 'completed' : 'pending' },
      { id: 'complete', name: 'Sync Complete', status: syncStatus?.status === 'completed' ? 'completed' : 'pending' }
    ];
  };

  const getEstimatedTimeRemaining = () => {
    if (!syncStatus || syncStatus.total_records === 0 || syncStatus.records_processed === 0) return null;
    
    const progress = syncStatus.records_processed / syncStatus.total_records;
    const elapsed = syncStatus.last_sync ? Date.now() - new Date(syncStatus.last_sync).getTime() : 0;
    const rate = syncStatus.records_processed / (elapsed / 1000); // cards per second
    const remaining = syncStatus.total_records - syncStatus.records_processed;
    const estimatedSeconds = remaining / rate;
    
    if (estimatedSeconds < 60) return `${Math.round(estimatedSeconds)}s`;
    if (estimatedSeconds < 3600) return `${Math.round(estimatedSeconds / 60)}m`;
    return `${Math.round(estimatedSeconds / 3600)}h`;
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
          <h2 className="text-xl font-semibold tracking-tight">Card sync</h2>
          <p className="text-sm text-muted-foreground">
            Scryfall &rarr; <code className="font-mono">cards</code>. Status, progress and manual controls.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadSyncStatus}
            disabled={isLoading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
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
           {(syncStatus?.status === 'running' || syncStatus?.status === 'failed') && (
            <Button
              onClick={resetSyncStatus}
              variant="secondary"
              size="sm"
              disabled={isTriggering}
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {isTriggering ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  {syncStatus?.status === 'running' ? 'Stop Sync' : 'Reset Status'}
                </>
              )}
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
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${getStatusPill(syncStatus.status)}`}
                >
                  {syncStatus.status}
                </span>
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
                ? `${syncStatus.records_processed.toLocaleString()}${syncStatus.total_records ? ` / ${syncStatus.total_records.toLocaleString()}` : ' cards'}`
                : 'No active sync'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Step Progress Indicator */}
      {syncStatus && (syncStatus.status === 'running' || syncStatus.status === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5 text-muted-foreground" />
              Sync Process Steps
            </CardTitle>
            <CardDescription>
              Track the progress of each sync stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {getSyncSteps().map((step, index) => (
                <div key={step.id} className="flex items-center space-x-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    step.status === 'completed' ? 'bg-foreground text-background' :
                    step.status === 'current' ? 'bg-foreground/15 text-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {step.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : step.status === 'current' ? (
                      <Activity className="h-4 w-4 animate-pulse" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${step.status === 'current' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.name}
                    </p>
                    {step.status === 'current' && step.id === 'download' && syncStatus.total_records > 0 && (
                      <div className="mt-1">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{syncStatus.records_processed.toLocaleString()}{syncStatus.total_records ? ` / ${syncStatus.total_records.toLocaleString()}` : ' cards'}</span>
                          <span>{getEstimatedTimeRemaining() && `~${getEstimatedTimeRemaining()} remaining`}</span>
                        </div>
                        <Progress value={calculateProgress()} className="h-2" />
                      </div>
                    )}
                  </div>
                  {/* The 1px connector that used to sit here rendered as a
                      stray hairline floating at the right edge of the row — it
                      connected nothing, because the steps are a column and it
                      was laid out at the end of each row. The numbered circles
                      carry the sequence on their own. */}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Bar */}
      {syncStatus && syncStatus.status === 'running' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5 animate-pulse text-muted-foreground motion-reduce:animate-none" />
              Sync in Progress
            </CardTitle>
            <CardDescription>
              {syncStatus.records_processed > 0 
                ? "Downloading and processing cards from Scryfall API"
                : "Initializing sync and connecting to Scryfall API..."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncStatus.records_processed > 0 ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{calculateProgress()}%</span>
                  </div>
                  <Progress value={calculateProgress()} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{syncStatus.records_processed.toLocaleString()} processed</span>
                    <span>{syncStatus.total_records ? `${syncStatus.total_records.toLocaleString()} total` : 'Fetching all cards'}</span>
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

      {/* Failure and stall notices.
          Not `<Alert>`: that primitive puts `border` in its base class and the
          destructive variant draws a hard red outline, which the no-hairlines
          rule forbids. A destructive surface tint carries the same urgency. */}
      {syncStatus?.status === 'failed' && syncStatus.error_message && (
        <div role="alert" className="rounded-lg bg-destructive/15 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm text-destructive">
              <strong className="font-semibold">Sync failed:</strong> {syncStatus.error_message}
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={resetSyncStatus}>
                  Reset status
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {syncStatus?.status === 'running' && syncStatus.last_sync &&
       new Date().getTime() - new Date(syncStatus.last_sync).getTime() > 3600000 && (
        <div role="alert" className="rounded-lg bg-destructive/15 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm text-destructive">
              <strong className="font-semibold">Sync appears stuck:</strong> it has been running for
              over an hour without progress, which usually means a dropped connection or an edge
              function timeout.
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" onClick={resetSyncStatus}>
                  Reset status
                </Button>
                <Button variant="secondary" size="sm" onClick={triggerSync}>
                  Restart sync
                </Button>
              </div>
            </div>
          </div>
        </div>
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
                <h4 className="mb-2 font-semibold text-destructive">Error details</h4>
                <div className="overflow-x-auto rounded-md bg-muted/50 p-3">
                  <code className="text-xs leading-relaxed">{syncStatus.error_message}</code>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Actions</CardTitle>
          <CardDescription>
            Use these actions to manually manage the sync process
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={triggerSync}
              disabled={isTriggering || syncStatus?.status === 'running'}
              className="w-full"
            >
              {isTriggering ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Full Sync
                </>
              )}
            </Button>
            
            <Button
              onClick={testSimpleSync}
              disabled={isTriggering || syncStatus?.status === 'running'}
              variant="secondary"
              className="w-full"
            >
              {isTriggering ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Test Sync (10 cards)
                </>
              )}
            </Button>

            <Button
              onClick={resetSyncStatus}
              variant="destructive"
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Reset Status
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={testScryfallAPI}
              disabled={isTestingAPI}
              variant="secondary"
              className="w-full"
            >
              {isTestingAPI ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Test Scryfall API
                </>
              )}
            </Button>
            
            <Button
              onClick={loadSyncStatus}
              variant="secondary"
              className="w-full"
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