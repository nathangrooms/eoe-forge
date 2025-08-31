import { useRef, useState, useCallback } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Request camera access with optimal settings for mobile
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment', // Back camera on mobile
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not found'));
            return;
          }

          const video = videoRef.current;
          
          const handleLoadedMetadata = () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
            resolve();
          };
          
          const handleError = (e: Event) => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
            reject(new Error('Video failed to load'));
          };

          video.addEventListener('loadedmetadata', handleLoadedMetadata);
          video.addEventListener('error', handleError);
          
          // Fallback timeout
          setTimeout(() => {
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
              video.removeEventListener('loadedmetadata', handleLoadedMetadata);
              video.removeEventListener('error', handleError);
              resolve();
            }
          }, 3000);
        });
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please grant permission and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found. Please ensure your device has a camera.');
        } else if (err.name === 'NotSupportedError') {
          setError('Camera not supported on this device.');
        } else {
          setError('Unable to access camera. Please check permissions and try again.');
        }
      } else {
        setError('Unknown camera error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setError(null);
  }, []);

  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    // Create or get canvas
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Ensure video dimensions are available
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    if (videoWidth === 0 || videoHeight === 0) {
      console.warn('Video dimensions not available yet');
      return null;
    }

    // Set canvas size to match video
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    try {
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
      
      // Validate image data
      if (!imageData || imageData.data.length === 0) {
        console.warn('Empty image data captured');
        return null;
      }

      return imageData;
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }, []);

  return {
    videoRef,
    stream: streamRef.current,
    isLoading,
    error,
    startCamera,
    stopCamera,
    captureFrame
  };
}