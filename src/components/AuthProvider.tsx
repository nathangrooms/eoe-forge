import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Track the previous user ID to detect user switches
    let previousUserId: string | null = null;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUserId = session?.user?.id ?? null;
        
        // Clear user-specific data when user changes (login/logout/switch)
        if (previousUserId !== currentUserId) {
          // Check if switching between two different users (not initial load or logout)
          const isUserSwitch = previousUserId !== null && currentUserId !== null;
          
          // Clear all user-specific localStorage
          localStorage.removeItem('mtg-deck-storage');
          localStorage.removeItem('deck-management-storage');
          localStorage.removeItem('mtg-collection-storage');
          localStorage.removeItem('price_watchlist');
          localStorage.removeItem('lastOpenedDecks');
          localStorage.removeItem('marketplace_preferences');
          localStorage.removeItem('collection_view_prefs');
          localStorage.removeItem('deck_builder_view');
          
          previousUserId = currentUserId;
          
          // Force page reload to reset zustand stores when switching between users
          if (isUserSwitch) {
            window.location.reload();
          }
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Check admin status
        if (session?.user?.id) {
          // Defer the profile fetch to avoid deadlock
          setTimeout(async () => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('is_admin')
              .eq('id', session.user.id)
              .maybeSingle();
            setIsAdmin(profile?.is_admin ?? false);
          }, 0);
        } else {
          setIsAdmin(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Check admin status
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .maybeSingle();
        setIsAdmin(profile?.is_admin ?? false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, username?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          username: username || email.split('@')[0]
        }
      }
    });
    return { error };
  };

  const signOut = async () => {
    setIsAdmin(false);
    
    // Clear user-specific localStorage data to prevent data leakage between users
    localStorage.removeItem('mtg-deck-storage');
    localStorage.removeItem('deck-management-storage');
    localStorage.removeItem('mtg-collection-storage');
    localStorage.removeItem('price_watchlist');
    localStorage.removeItem('lastOpenedDecks');
    localStorage.removeItem('marketplace_preferences');
    localStorage.removeItem('collection_view_prefs');
    localStorage.removeItem('deck_builder_view');
    
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    isAdmin,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}