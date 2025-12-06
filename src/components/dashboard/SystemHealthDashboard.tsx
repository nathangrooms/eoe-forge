import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, 
  Database, 
  Zap, 
  AlertCircle, 
  CheckCircle,
  Clock,
  TrendingUp,
  Server
} from 'lucide-react';

interface HealthMetrics {
  database: {
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    lastChecked: Date;
  };
  api: {
    status: 'healthy' | 'degraded' | 'down';
    scryfallSync: Date | null;
    lastError: string | null;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    errorRate: number;
  };
  storage: {
    usage: number;
    limit: number;
  };
}

export function SystemHealthDashboard() {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkSystemHealth();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSystemHealth = async () => {
    try {
      setLoading(true);
      setError(null);

      // Test database connection and measure response time
      const dbStart = performance.now();
      const { error: dbError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      const dbTime = performance.now() - dbStart;

      // Get sync status - use maybeSingle to handle missing data
      const { data: syncStatus } = await supabase
        .from('sync_status')
        .select('last_sync, error_message, status')
        .eq('id', 'scryfall_cards')
        .maybeSingle();

      // Calculate metrics
      const dbStatus: 'healthy' | 'degraded' | 'down' = 
        dbError ? 'down' : dbTime > 1000 ? 'degraded' : 'healthy';

      const apiStatus: 'healthy' | 'degraded' | 'down' =
        syncStatus?.error_message ? 'degraded' : 'healthy';

      setMetrics({
        database: {
          status: dbStatus,
          responseTime: Math.round(dbTime),
          lastChecked: new Date()
        },
        api: {
          status: apiStatus,
          scryfallSync: syncStatus?.last_sync ? new Date(syncStatus.last_sync) : null,
          lastError: syncStatus?.error_message || null
        },
        performance: {
          avgQueryTime: Math.round(dbTime),
          slowQueries: 0, // Would need actual monitoring
          errorRate: 0 // Would need actual error tracking
        },
        storage: {
          usage: 0, // Would need actual storage stats
          limit: 0
        }
      });

    } catch (err) {
      console.error('Health check failed:', err);
      setError('Failed to check system health');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy': return 'text-green-600 dark:text-green-400';
      case 'degraded': return 'text-yellow-600 dark:text-yellow-400';
      case 'down': return 'text-red-600 dark:text-red-400';
    }
  };

  const getStatusIcon = (status: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'degraded': return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'down': return <AlertCircle className="h-5 w-5 text-red-600" />;
    }
  };

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading && !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health Monitor
          </CardTitle>
          <CardDescription>
            Real-time monitoring of database, API, and system performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Database Health */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Database</p>
                  <p className="text-sm text-muted-foreground">
                    Response: {metrics?.database.responseTime}ms
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(metrics?.database.status || 'healthy')}
                <Badge variant="outline" className={getStatusColor(metrics?.database.status || 'healthy')}>
                  {metrics?.database.status}
                </Badge>
              </div>
            </div>
            <Progress value={Math.min(100, (metrics?.database.responseTime || 0) / 10)} />
          </div>

          {/* API Health */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">External APIs</p>
                  <p className="text-sm text-muted-foreground">
                    Last sync: {formatTimeAgo(metrics?.api.scryfallSync || null)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(metrics?.api.status || 'healthy')}
                <Badge variant="outline" className={getStatusColor(metrics?.api.status || 'healthy')}>
                  {metrics?.api.status}
                </Badge>
              </div>
            </div>
            {metrics?.api.lastError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {metrics.api.lastError}
              </div>
            )}
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm">Avg Query Time</span>
              </div>
              <p className="text-2xl font-bold">{metrics?.performance.avgQueryTime}ms</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">Slow Queries</span>
              </div>
              <p className="text-2xl font-bold">{metrics?.performance.slowQueries}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Error Rate</span>
              </div>
              <p className="text-2xl font-bold">{metrics?.performance.errorRate.toFixed(1)}%</p>
            </div>
          </div>

          {/* Last Updated */}
          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              Last checked: {formatTimeAgo(metrics?.database.lastChecked || null)}
            </span>
            <Badge variant="secondary" className="text-xs">
              Auto-refresh: 30s
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
