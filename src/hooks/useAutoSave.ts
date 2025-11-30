import { useEffect, useRef, useCallback } from 'react';
import { useToast } from './use-toast';

interface UseAutoSaveOptions {
  onSave: () => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

/**
 * Auto-save hook with proper debouncing to prevent race conditions
 * Waits for user to stop making changes before saving
 */
export function useAutoSave({ onSave, delay = 2000, enabled = true }: UseAutoSaveOptions) {
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const lastSaveTimeRef = useRef<number>(Date.now());

  const triggerSave = useCallback(async () => {
    if (isSavingRef.current) {
      // If already saving, mark that we need to save again
      pendingSaveRef.current = true;
      return;
    }

    try {
      isSavingRef.current = true;
      pendingSaveRef.current = false;
      await onSave();
      lastSaveTimeRef.current = Date.now();
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast({
        title: "Auto-save Failed",
        description: "Your changes could not be saved. Please try again.",
        variant: "destructive"
      });
    } finally {
      isSavingRef.current = false;
      
      // If there was a pending save request, trigger it now
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => triggerSave(), 500); // Small delay before retry
      }
    }
  }, [onSave, toast]);

  const debouncedSave = useCallback(() => {
    if (!enabled) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      triggerSave();
    }, delay);
  }, [enabled, delay, triggerSave]);

  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const forceSave = useCallback(async () => {
    cancelSave();
    await triggerSave();
  }, [cancelSave, triggerSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    triggerAutoSave: debouncedSave,
    cancelAutoSave: cancelSave,
    forceSave,
    isSaving: isSavingRef.current,
    lastSaveTime: lastSaveTimeRef.current
  };
}
