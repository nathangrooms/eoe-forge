import { useState, useEffect, useRef, useCallback } from 'react';
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
  const isRunning = useRef(false);

  // Store callbacks in refs to avoid dependency issues
  const captureFrameRef = useRef(captureFrame);
  const onCaptureRef = useRef(onCapture);
  const optionsRef = useRef(options);

  // Update refs when props change
  useEffect(() => {
    captureFrameRef.current = captureFrame;
    onCaptureRef.current = onCapture;
    optionsRef.current = options;
  }, [captureFrame, onCapture, options]);

  const checkSharpness = useCallback(() => {
    if (!optionsRef.current.enabled || !isRunning.current) {
      return;
    }

    const now = Date.now();
    
    // Cooldown check - prevent rapid processing cycles
    if (now - lastCaptureTime.current < optionsRef.current.cooldownDelay) {
      animationFrameRef.current = requestAnimationFrame(checkSharpness);
      return;
    }

    const frameData = captureFrameRef.current();
    if (!frameData || frameData.width === 0 || frameData.height === 0) {
      animationFrameRef.current = requestAnimationFrame(checkSharpness);
      return;
    }

    try {
      const sharpness = calculateSharpness(frameData);
      
      if (sharpness > optionsRef.current.sharpnessThreshold) {
        // Image is sharp
        if (stableStartTime.current === 0) {
          stableStartTime.current = now;
        } else if (now - stableStartTime.current >= optionsRef.current.stabilityDelay) {
          // Image has been stable and sharp for required duration
          setIsCapturing(true);
          lastCaptureTime.current = now;
          stableStartTime.current = 0;
          
          // Trigger capture
          onCaptureRef.current(frameData);
          setIsCapturing(false);
          
          // Continue loop after cooldown
          animationFrameRef.current = requestAnimationFrame(checkSharpness);
          return;
        }
      } else {
        // Image not sharp enough, reset timer
        stableStartTime.current = 0;
      }
    } catch (error) {
      console.error('Error checking sharpness:', error);
      stableStartTime.current = 0;
    }

    animationFrameRef.current = requestAnimationFrame(checkSharpness);
  }, []);

  useEffect(() => {
    if (options.enabled) {
      isRunning.current = true;
      stableStartTime.current = 0;
      animationFrameRef.current = requestAnimationFrame(checkSharpness);
    } else {
      isRunning.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      isRunning.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [options.enabled, checkSharpness]);

  const stop = useCallback(() => {
    isRunning.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    stableStartTime.current = 0;
    setIsCapturing(false);
  }, []);

  return { isCapturing, stop };
}