import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Users, Search, Shield, Mail } from 'lucide-react';

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  created_at: string;
  updated_at: string;
}

/** A missing or unparseable timestamp shows an em dash, not "Invalid Date". */
function formatJoined(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}


export function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error: any) {
      toast.error('Failed to load users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean | null) => {
    try {
      // Direct `profiles.is_admin` writes are blocked at the database. The old
      // policy let ANY logged-in user grant themselves admin, and it silently
      // no-opped for every user other than yourself while still reporting
      // success. set_user_admin() is a SECURITY DEFINER RPC gated on
      // is_dev_admin().
      const { error } = await supabase.rpc('set_user_admin', {
        target_user: userId,
        make_admin: !currentStatus,
      });

      if (error) throw error;

      toast.success('User permissions updated');
      loadProfiles();
    } catch (error: any) {
      toast.error('Failed to update permissions: ' + error.message);
    }
  };

  const filteredProfiles = profiles.filter(profile => 
    profile.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    profile.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>
            View and manage user accounts and permissions. Click a row to open that user's page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users...</div>
          ) : (
            <div className="overflow-hidden rounded-md bg-muted/20">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProfiles.map((profile) => (
                      <TableRow 
                        key={profile.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/admin/users/${profile.id}`)}
                      >
                        <TableCell className="font-medium">
                          {profile.username || 'No username'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {profile.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          {profile.is_admin ? (
                            <Badge variant="default">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary">User</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {/* A missing or malformed timestamp rendered the
                              literal string "Invalid Date" in the table. */}
                          {formatJoined(profile.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAdmin(profile.id, profile.is_admin);
                            }}
                          >
                            {profile.is_admin ? 'Remove Admin' : 'Make Admin'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <p>Total users: {profiles.length}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
