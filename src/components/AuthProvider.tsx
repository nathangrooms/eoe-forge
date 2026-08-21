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
    /* Track the previous user id to detect a change of identity.
     *
     * `undefined` means "no auth event seen yet" and is NOT the same as `null`,
     * which means "signed out". Starting this at `null` is what let one user's
     * data render for the next one. */
    let previousUserId: string | null | undefined = undefined;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUserId = session?.user?.id ?? null;
        
        /* ONE USER'S DATA WAS RENDERING FOR THE NEXT ONE.
         *
         * Owner, after making a new account: "their shopping list was filled
         * with anothers, collection page showed 1 card on the way for another
         * user, proxy list was also filled".
         *
         * The database was never the problem. RLS on card_list_items,
         * user_collections and wishlist is `auth.uid() = user_id` and was
         * verified correct. This was entirely client side: the zustand stores
         * hold the previous user's rows in MEMORY, and clearing localStorage
         * does not touch them. Only the reload below resets them.
         *
         * The reload never fired on the normal path. `isUserSwitch` demanded
         * both ids be non-null, so signing out went A -> null (no reload) and
         * signing in went null -> B (no reload). It only ever triggered on a
         * direct A -> B swap, which almost nobody does.
         *
         * Now ANY change of identity reloads, including to and from signed out.
         * The only case that does not is the first auth event of a page load,
         * where there is nothing stale to clear. */
        if (previousUserId !== currentUserId) {
          const isInitialLoad = previousUserId === undefined;
          
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
          
          // Reset every in-memory store. Clearing localStorage above is not
          // enough on its own: the live stores are what the pages read.
          if (!isInitialLoad) {
            window.location.reload();
            return;
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