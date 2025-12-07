import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Upload, Camera } from 'lucide-react';
import { MobileNavigation } from './MobileNavigation';

const FORMATS = [
  { value: 'standard', label: 'Standard' },
  { value: 'commander', label: 'Commander' },
  { value: 'modern', label: 'Modern' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' }
];

export function TopNavigation() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('standard');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) setIsAdmin(profile.is_admin || false);
    };
    checkAdminStatus();
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/cards?q=${encodeURIComponent(searchQuery)}&format=${selectedFormat}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleNewDeck = () => navigate('/deck-builder');
  const handleImportCollection = () => navigate('/collection?tab=add-cards');

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full flex h-16 md:h-20 items-center justify-between px-3 md:px-6">
        {/* Left: Mobile menu + camera, Desktop logo */}
        <div className="flex items-center gap-3 md:flex-none flex-1 md:flex-initial">
          <div className="md:hidden flex items-center gap-2">
            <MobileNavigation />
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate('/scan')}>
              <Camera className="h-5 w-5" />
              <span className="sr-only">Fast Scan</span>
            </Button>
          </div>
          <div className="hidden md:flex items-center gap-2 cursor-pointer" onClick={() => navigate('/') }>
            <img src="/lovable-uploads/099c667b-3e64-4ac4-94a8-18b5bf6a8ecb.png" alt="DECKMATRIX" className="h-12 md:h-20 w-auto py-1" />
          </div>
        </div>

        {/* Mobile: Centered logo */}
        <div className="md:hidden flex justify-center flex-1">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/') }>
            <img src="/lovable-uploads/099c667b-3e64-4ac4-94a8-18b5bf6a8ecb.png" alt="DECKMATRIX" className="h-12 w-auto py-1" />
          </div>
        </div>

        {/* Center: Search (desktop) */}
        <div className="hidden md:flex flex-1 justify-center">
          <div className="w-full max-w-2xl">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cards (Scryfall syntax)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </form>
          </div>
        </div>

        {/* Right: Quick actions + auth */}
        <div className="flex items-center gap-1 md:gap-2 flex-1 md:flex-initial justify-end">
          {/* Mobile: just search */}
          <div className="md:hidden flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/cards')}>
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Desktop buttons */}
          <div className="hidden md:flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleNewDeck}>
              <Plus className="h-4 w-4 mr-2" />
              New Deck
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportCollection}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/cards')}>
              <Search className="h-4 w-4 mr-2" />
              Card Search
            </Button>
          </div>

          {/* Auth control - only show sign in on mobile, sign out moved to nav menu */}
          {!user && (
            <Button onClick={() => navigate('/auth')} size="sm">Sign In</Button>
          )}
        </div>
      </div>

    </header>
  );
}
