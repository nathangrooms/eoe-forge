import { useEffect, useRef, useCallback } from 'react';

/**
 * Performance optimization hook for expensive operations
 * Provides memoization, debouncing, and throttling utilities
 */

export interface PerformanceMetrics {
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
}

/**
 * Debounce a function call
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

/**
 * Throttle a function call
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const lastRun = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastRun.current >= limit) {
        callback(...args);
        lastRun.current = now;
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastRun.current = Date.now();
        }, limit - (now - lastRun.current));
      }
    },
    [callback, limit]
  );
}

/**
 * Track render performance metrics
 */
export function useRenderPerformance(componentName: string): PerformanceMetrics {
  const metricsRef = useRef<PerformanceMetrics>({
    renderCount: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
  });
  const startTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const renderTime = performance.now() - startTimeRef.current;
    metricsRef.current.renderCount++;
    metricsRef.current.lastRenderTime = renderTime;
    metricsRef.current.averageRenderTime =
      (metricsRef.current.averageRenderTime * (metricsRef.current.renderCount - 1) + renderTime) /
      metricsRef.current.renderCount;

    if (renderTime > 16.67) {
      // Slower than 60fps
      console.warn(
        `[Performance] ${componentName} render took ${renderTime.toFixed(2)}ms (slower than 60fps)`
      );
    }

    startTimeRef.current = performance.now();
  });

  return metricsRef.current;
}

/**
 * Lazy load components with intersection observer
 */
export function useLazyLoad(options?: IntersectionObserverInit) {
  const targetRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    if (!targetRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisibleRef.current) {
            isVisibleRef.current = true;
          }
        });
      },
      options || { threshold: 0.1 }
    );

    observerRef.current.observe(targetRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [options]);

  return { targetRef, isVisible: isVisibleRef.current };
}

/**
 * Memoize expensive calculations
 */
export function useMemoizedCalculation<T>(
  calculate: () => T,
  dependencies: any[],
  cacheSize: number = 10
): T {
  const cacheRef = useRef<Map<string, T>>(new Map());

  const key = JSON.stringify(dependencies);

  if (cacheRef.current.has(key)) {
    return cacheRef.current.get(key)!;
  }

  const result = calculate();
  cacheRef.current.set(key, result);

  // Maintain cache size
  if (cacheRef.current.size > cacheSize) {
    const firstKey = cacheRef.current.keys().next().value;
    cacheRef.current.delete(firstKey);
  }

  return result;
}

/**
 * Virtual scrolling for large lists
 */
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) {
  const scrollTop = useRef(0);
  const startIndex = Math.floor(scrollTop.current / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    scrollTop.current = e.currentTarget.scrollTop;
  }, []);

  return {
    visibleItems,
    offsetY,
    handleScroll,
    totalHeight: items.length * itemHeight,
  };
}

/**
 * Request idle callback for non-critical work
 */
export function useIdleCallback(callback: () => void, options?: IdleRequestOptions) {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(callback, options);
      return () => window.cancelIdleCallback(handle);
    } else {
      // Fallback for browsers that don't support requestIdleCallback
      const timeout = setTimeout(callback, 1);
      return () => clearTimeout(timeout);
    }
  }, [callback, options]);
}
