import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js to always download models
env.allowLocalModels = false;
env.useBrowserCache = true;

let ocrPipeline: any = null;

const initializeOCR = async () => {
  if (!ocrPipeline) {
    try {
      console.log('Initializing OCR pipeline...');
      ocrPipeline = await pipeline(
        'image-to-text',
        'Xenova/trocr-base-printed',
        { device: 'webgpu' }
      );
      console.log('OCR pipeline initialized successfully');
    } catch (error) {
      console.warn('WebGPU not available, falling back to CPU:', error);
      ocrPipeline = await pipeline(
        'image-to-text',
        'Xenova/trocr-base-printed'
      );
    }
  }
  return ocrPipeline;
};

export const enhancedOCR = async (imageData: ImageData): Promise<{ text: string; confidence: number }> => {
  try {
    const pipeline = await initializeOCR();
    
    // Convert ImageData to canvas and then to base64
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Could not get canvas context');
    
    ctx.putImageData(imageData, 0, 0);
    const dataURL = canvas.toDataURL('image/png');
    
    console.log('Processing image with enhanced OCR...');
    const result = await pipeline(dataURL);
    
    console.log('Enhanced OCR result:', result);
    
    if (result && result.generated_text) {
      // Clean up the text - remove common OCR artifacts
      let text = result.generated_text.trim();
      text = text.replace(/[^\w\s',.-]/g, ''); // Remove special characters except common ones
      text = text.replace(/\s+/g, ' '); // Normalize whitespace
      
      // Calculate confidence based on text quality
      let confidence = 0.8; // Default high confidence for this model
      
      // Reduce confidence for very short or suspicious text
      if (text.length < 3) confidence = 0.2;
      else if (text.length < 5) confidence = 0.4;
      else if (/^\d+$/.test(text)) confidence = 0.3; // Numbers only
      else if (!/[a-zA-Z]/.test(text)) confidence = 0.3; // No letters
      
      return { text, confidence };
    }
    
    return { text: '', confidence: 0 };
  } catch (error) {
    console.error('Enhanced OCR failed:', error);
    return { text: '', confidence: 0 };
  }
};

export const preloadOCRModel = async () => {
  try {
    await initializeOCR();
    console.log('OCR model preloaded successfully');
  } catch (error) {
    console.error('Failed to preload OCR model:', error);
  }
};