import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const WARNING_DURATION = 5 * 60 * 1000; // 5 minutes before timeout

/**
 * Hook to handle session timeout and auto-logout
 */
export function useSessionTimeout() {
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef<number>(Date.now());

  const resetTimers = () => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Set warning timer
    warningRef.current = setTimeout(() => {
      toast.warning('Your session will expire in 5 minutes due to inactivity');
    }, TIMEOUT_DURATION - WARNING_DURATION);

    // Set logout timer
    timeoutRef.current = setTimeout(async () => {
      toast.error('Session expired due to inactivity');
      await supabase.auth.signOut();
      navigate('/login');
    }, TIMEOUT_DURATION);
  };

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        resetTimers();
      }
    };

    checkAuth();

    // Activity events to track
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      const now = Date.now();
      // Only reset if more than 1 minute has passed since last activity
      if (now - lastActivityRef.current > 60000) {
        resetTimers();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        resetTimers();
      } else if (event === 'SIGNED_OUT') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (warningRef.current) clearTimeout(warningRef.current);
      }
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return { resetTimers };
}
