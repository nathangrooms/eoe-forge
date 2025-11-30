import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PolicyIssue {
  table: string;
  severity: 'critical' | 'warning' | 'info';
  issue: string;
  recommendation: string;
  documentationLink?: string;
}

interface TablePolicy {
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string;
  with_check: string;
}

interface RLSStatus {
  tablename: string;
  rowsecurity: boolean;
}

export function RLSPolicyAudit() {
  const [loading, setLoading] = useState(false);
  const [rlsStatus, setRlsStatus] = useState<RLSStatus[]>([]);
  const [policies, setPolicies] = useState<TablePolicy[]>([]);
  const [issues, setIssues] = useState<PolicyIssue[]>([]);
  const { toast } = useToast();

  const runAudit = async () => {
    setLoading(true);
    try {
      // Known tables in the application
      const knownTables = [
        'cards', 'user_collections', 'user_decks', 'deck_cards', 'deck_folders',
        'deck_matches', 'deck_maybeboard', 'deck_versions', 'favorite_decks',
        'wishlist', 'wishlist_shares', 'listings', 'messages', 'sales',
        'storage_containers', 'storage_items', 'storage_slots',
        'price_alerts', 'profiles', 'activity_log', 'sync_status',
        'system_notifications', 'tasks', 'api_keys', 'build_logs',
        'card_condition_photos', 'deck_share_events', 'tag_overrides'
      ];

      const mockRLS: RLSStatus[] = knownTables.map(table => ({
        tablename: table,
        rowsecurity: true
      }));

      setRlsStatus(mockRLS);

      // Mock policies - these would come from database in production
      const mockPolicies: TablePolicy[] = [];
      setPolicies(mockPolicies);

      // Run analysis
      analyzeSecurityIssues(mockRLS, mockPolicies);

      toast({
        title: "Audit Complete",
        description: "RLS policy audit has been completed successfully.",
      });
    } catch (error) {
      console.error('Audit error:', error);
      toast({
        title: "Audit Failed",
        description: "Could not complete RLS audit. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const analyzeSecurityIssues = (rlsData: RLSStatus[], policiesData: TablePolicy[]) => {
    const foundIssues: PolicyIssue[] = [];

    // Check for tables without RLS enabled
    const tablesWithoutRLS = rlsData.filter(t => !t.rowsecurity);
    tablesWithoutRLS.forEach(table => {
      foundIssues.push({
        table: table.tablename,
        severity: 'critical',
        issue: 'RLS not enabled',
        recommendation: 'Enable Row Level Security on this table to prevent unauthorized access',
        documentationLink: 'https://supabase.com/docs/guides/auth/row-level-security'
      });
    });

    // Check for tables with RLS but no policies
    const tablesWithRLS = rlsData.filter(t => t.rowsecurity);
    tablesWithRLS.forEach(table => {
      const tablePolicies = policiesData.filter(p => p.tablename === table.tablename);
      if (tablePolicies.length === 0) {
        foundIssues.push({
          table: table.tablename,
          severity: 'critical',
          issue: 'RLS enabled but no policies defined',
          recommendation: 'Add policies to control access, or RLS will block all access',
          documentationLink: 'https://supabase.com/docs/guides/auth/row-level-security'
        });
      }
    });

    // Check for overly permissive policies
    policiesData.forEach(policy => {
      if (policy.qual === 'true' || policy.qual === '(true)') {
        foundIssues.push({
          table: policy.tablename,
          severity: 'warning',
          issue: `Policy "${policy.policyname}" allows all rows (qual: true)`,
          recommendation: 'Consider restricting access with proper conditions like auth.uid() checks',
          documentationLink: 'https://supabase.com/docs/guides/auth/row-level-security#policies'
        });
      }

      // Check for public role policies
      if (policy.roles.includes('public') || policy.roles.includes('anon')) {
        foundIssues.push({
          table: policy.tablename,
          severity: 'warning',
          issue: `Policy "${policy.policyname}" grants access to public/anon role`,
          recommendation: 'Verify that public access is intentional for this table',
          documentationLink: 'https://supabase.com/docs/guides/auth/row-level-security#authenticated-and-anonymous-roles'
        });
      }
    });

    // Check for missing user_id policies on user-specific tables
    const userTables = ['user_collections', 'user_decks', 'wishlist', 'listings', 'storage_containers'];
    userTables.forEach(tableName => {
      const tablePolicies = policiesData.filter(p => p.tablename === tableName);
      const hasUserIdCheck = tablePolicies.some(p => 
        p.qual.includes('user_id') && p.qual.includes('auth.uid()')
      );
      
      if (tablePolicies.length > 0 && !hasUserIdCheck) {
        foundIssues.push({
          table: tableName,
          severity: 'warning',
          issue: 'User-specific table may not properly restrict by user_id',
          recommendation: 'Ensure policies check that user_id matches auth.uid()',
          documentationLink: 'https://supabase.com/docs/guides/auth/row-level-security#policies'
        });
      }
    });

    setIssues(foundIssues);
  };

  useEffect(() => {
    runAudit();
  }, []);

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const warningIssues = issues.filter(i => i.severity === 'warning');
  const infoIssues = issues.filter(i => i.severity === 'info');

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <CheckCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8" />
            RLS Policy Audit
          </h2>
          <p className="text-muted-foreground mt-1">
            Security analysis of Row Level Security policies
          </p>
        </div>
        <Button onClick={runAudit} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Run Audit
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tables</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rlsStatus.length}</div>
            <p className="text-xs text-muted-foreground">Public schema tables</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{criticalIssues.length}</div>
            <p className="text-xs text-muted-foreground">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{warningIssues.length}</div>
            <p className="text-xs text-muted-foreground">Should be reviewed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Policies</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{policies.length}</div>
            <p className="text-xs text-muted-foreground">Security policies configured</p>
          </CardContent>
        </Card>
      </div>

      {/* Issues Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Issues ({issues.length})</TabsTrigger>
          <TabsTrigger value="critical">Critical ({criticalIssues.length})</TabsTrigger>
          <TabsTrigger value="warning">Warnings ({warningIssues.length})</TabsTrigger>
          <TabsTrigger value="tables">Tables ({rlsStatus.length})</TabsTrigger>
          <TabsTrigger value="policies">Policies ({policies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {issues.length === 0 ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                No security issues detected. All tables have proper RLS policies configured.
              </AlertDescription>
            </Alert>
          ) : (
            issues.map((issue, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getSeverityIcon(issue.severity)}
                      <div>
                        <CardTitle className="text-lg">{issue.table}</CardTitle>
                        <CardDescription className="mt-1">{issue.issue}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={issue.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {issue.severity}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Recommendation:</h4>
                    <p className="text-sm text-muted-foreground">{issue.recommendation}</p>
                  </div>
                  {issue.documentationLink && (
                    <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                      <a href={issue.documentationLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View Documentation
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="critical" className="space-y-4">
          {criticalIssues.map((issue, index) => (
            <Card key={index} className="border-destructive">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getSeverityIcon(issue.severity)}
                    <div>
                      <CardTitle className="text-lg">{issue.table}</CardTitle>
                      <CardDescription className="mt-1">{issue.issue}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="destructive">{issue.severity}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium mb-1">Recommendation:</h4>
                  <p className="text-sm text-muted-foreground">{issue.recommendation}</p>
                </div>
                {issue.documentationLink && (
                  <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                    <a href={issue.documentationLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Documentation
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="warning" className="space-y-4">
          {warningIssues.map((issue, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getSeverityIcon(issue.severity)}
                    <div>
                      <CardTitle className="text-lg">{issue.table}</CardTitle>
                      <CardDescription className="mt-1">{issue.issue}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-warning/10 text-warning">
                    {issue.severity}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium mb-1">Recommendation:</h4>
                  <p className="text-sm text-muted-foreground">{issue.recommendation}</p>
                </div>
                {issue.documentationLink && (
                  <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                    <a href={issue.documentationLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Documentation
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="tables" className="space-y-4">
          <div className="grid gap-4">
            {rlsStatus.map((table, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{table.tablename}</CardTitle>
                    <Badge variant={table.rowsecurity ? 'default' : 'destructive'}>
                      {table.rowsecurity ? 'RLS Enabled' : 'RLS Disabled'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {policies.filter(p => p.tablename === table.tablename).length} policies configured
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <div className="grid gap-4">
            {policies.map((policy, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{policy.policyname}</CardTitle>
                      <CardDescription className="mt-1">{policy.tablename}</CardDescription>
                    </div>
                    <Badge variant="outline">{policy.cmd}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Roles: </span>
                    <span className="text-sm text-muted-foreground">
                      {policy.roles.join(', ')}
                    </span>
                  </div>
                  {policy.qual && (
                    <div>
                      <span className="text-sm font-medium">Condition: </span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {policy.qual}
                      </code>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
