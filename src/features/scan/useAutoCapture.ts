import { useState, useEffect, useRef } from 'react';
import { calculateSharpness } from './image';

interface AutoCaptureOptions {
  enabled: boolean;
  sharpnessThreshold: number;
  stabilityDelay: number;
  cooldownDelay: number;
}

export function useAutoCapture(
  captureFrame: () => ImageData | null,
  onCapture: (imageData: ImageData) => void,
  options: AutoCaptureOptions
) {
  const [isCapturing, setIsCapturing] = useState(false);
  const lastCaptureTime = useRef(0);
  const stableStartTime = useRef(0);
  const animationFrameRef = useRef<number>();

  const checkSharpness = () => {
    if (!options.enabled || isCapturing) return;

    const now = Date.now();
    
    // Cooldown check
    if (now - lastCaptureTime.current < options.cooldownDelay) {
      animationFrameRef.current = requestAnimationFrame(checkSharpness);
      return;
    }

    const frameData = captureFrame();
    if (!frameData) {
      animationFrameRef.current = requestAnimationFrame(checkSharpness);
      return;
    }

    const sharpness = calculateSharpness(frameData);
    
    if (sharpness > options.sharpnessThreshold) {
      // Image is sharp
      if (stableStartTime.current === 0) {
        stableStartTime.current = now;
      } else if (now - stableStartTime.current >= options.stabilityDelay) {
        // Image has been stable and sharp for required duration
        setIsCapturing(true);
        lastCaptureTime.current = now;
        stableStartTime.current = 0;
        
        setTimeout(() => {
          onCapture(frameData);
          setIsCapturing(false);
        }, 100);
        
        return;
      }
    } else {
      // Image not sharp enough, reset timer
      stableStartTime.current = 0;
    }

    animationFrameRef.current = requestAnimationFrame(checkSharpness);
  };

  useEffect(() => {
    if (options.enabled) {
      animationFrameRef.current = requestAnimationFrame(checkSharpness);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [options.enabled, isCapturing]);

  const stop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    stableStartTime.current = 0;
    setIsCapturing(false);
  };

  return { isCapturing, stop };
}