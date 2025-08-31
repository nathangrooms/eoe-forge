// Crop the title band area (focused on card name only)
export function cropTitleBand(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  
  // Much more focused crop - just the top title area where card names appear
  const cropHeight = Math.floor(height * 0.12); // Only top 12% for title
  const cropY = Math.floor(height * 0.08); // Start a bit lower to avoid border
  const cropX = Math.floor(width * 0.05); // Crop sides to avoid border
  const cropWidth = Math.floor(width * 0.9); // 90% width to avoid edges
  
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

// Convert to grayscale and enhance contrast
export function preprocessForOCR(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  canvas.width = width;
  canvas.height = height;
  
  const processedData = ctx.createImageData(width, height);
  
  // Convert to grayscale with enhanced contrast
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Grayscale conversion with slight blue bias (card names often have blue)
    const gray = Math.floor(0.2126 * r + 0.7152 * g + 0.0722 * b);
    
    // Simple contrast enhancement
    const enhanced = gray < 128 ? Math.max(0, gray - 20) : Math.min(255, gray + 20);
    
    processedData.data[i] = enhanced;     // R
    processedData.data[i + 1] = enhanced; // G
    processedData.data[i + 2] = enhanced; // B
    processedData.data[i + 3] = 255;      // A
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