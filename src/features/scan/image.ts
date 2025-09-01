// Crop the title band area (very top where card name is isolated)
export function cropTitleBand(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  
  // Optimized crop for better card name isolation
  const cropHeight = Math.floor(height * 0.12); // Slightly larger for better capture
  const cropY = Math.floor(height * 0.03); // More margin from top edge
  const cropX = Math.floor(width * 0.05); // Less aggressive edge removal
  const cropWidth = Math.floor(width * 0.90); // Keep more of the card width
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  
  // Create new ImageData for cropped region
  const croppedData = ctx.createImageData(cropWidth, cropHeight);
  
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < cropWidth; x++) {
      const sourceIndex = ((y + cropY) * width + (x + cropX)) * 4;
      const targetIndex = (y * cropWidth + x) * 4;
      
      // Ensure we don't go out of bounds
      if (sourceIndex + 3 < data.length) {
        croppedData.data[targetIndex] = data[sourceIndex];     // R
        croppedData.data[targetIndex + 1] = data[sourceIndex + 1]; // G
        croppedData.data[targetIndex + 2] = data[sourceIndex + 2]; // B
        croppedData.data[targetIndex + 3] = data[sourceIndex + 3]; // A
      }
    }
  }
  
  return croppedData;
}

// Convert to grayscale and enhance contrast specifically for card text
export function preprocessForOCR(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  canvas.width = width;
  canvas.height = height;
  
  const processedData = ctx.createImageData(width, height);
  
  // Enhanced preprocessing with adaptive thresholding
  const grayscaleData = new Array(width * height);
  
  // First pass: convert to grayscale and calculate average brightness
  let totalBrightness = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
    grayscaleData[j] = gray;
    totalBrightness += gray;
  }
  
  const avgBrightness = totalBrightness / grayscaleData.length;
  const threshold = Math.max(100, Math.min(180, avgBrightness * 0.8)); // Adaptive threshold
  
  // Second pass: apply enhanced binary threshold with noise reduction
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const gray = grayscaleData[j];
    
    // Apply threshold with slight smoothing for better text recognition
    let binary = gray > threshold ? 255 : 0;
    
    // Simple noise reduction - check neighboring pixels
    if (j > width && j < grayscaleData.length - width && j % width > 0 && j % width < width - 1) {
      const neighbors = [
        grayscaleData[j - 1], grayscaleData[j + 1],
        grayscaleData[j - width], grayscaleData[j + width]
      ];
      const neighborAvg = neighbors.reduce((a, b) => a + b, 0) / 4;
      
      // If pixel differs significantly from neighbors, smooth it
      if (Math.abs(gray - neighborAvg) > 50) {
        binary = neighborAvg > threshold ? 255 : 0;
      }
    }
    
    processedData.data[i] = binary;     // R
    processedData.data[i + 1] = binary; // G
    processedData.data[i + 2] = binary; // B
    processedData.data[i + 3] = 255;    // A
  }
  
  return processedData;
}

// Calculate focus metric using Laplacian variance
export function calculateSharpness(imageData: ImageData): number {
  const { width, height, data } = imageData;
  
  // Validate input
  if (width === 0 || height === 0 || data.length === 0) {
    return 0;
  }
  
  // Convert to grayscale first
  const grayData = new Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    grayData[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  
  // Apply Laplacian kernel (avoid edges to prevent index errors)
  let sum = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Check bounds
      if (idx - width - 1 >= 0 && idx + width + 1 < grayData.length) {
        const laplacian = 
          -grayData[idx - width - 1] - grayData[idx - width] - grayData[idx - width + 1] +
          -grayData[idx - 1] + 8 * grayData[idx] - grayData[idx + 1] +
          -grayData[idx + width - 1] - grayData[idx + width] - grayData[idx + width + 1];
        
        sum += laplacian * laplacian;
        count++;
      }
    }
  }
  
  return count > 0 ? sum / count : 0;
}

// Resize image for faster OCR processing
export function resizeForOCR(imageData: ImageData, maxWidth = 640): ImageData {
  const { width, height } = imageData;
  
  if (width <= maxWidth) return imageData;
  
  const scale = maxWidth / width;
  const newWidth = maxWidth;
  const newHeight = Math.floor(height * scale);
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  // First draw original image to a canvas
  const sourceCanvas = document.createElement('canvas');
  const sourceCtx = sourceCanvas.getContext('2d');
  
  if (!sourceCtx) throw new Error('Could not get source canvas context');
  
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  sourceCtx.putImageData(imageData, 0, 0);
  
  // Then resize
  canvas.width = newWidth;
  canvas.height = newHeight;
  ctx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight);
  
  return ctx.getImageData(0, 0, newWidth, newHeight);
}