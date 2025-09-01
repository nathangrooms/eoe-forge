import { createWorker } from 'tesseract.js';

class OCRWorker {
  private worker: Tesseract.Worker | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    try {
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,\'-.:/() ',
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: '8', // Single word mode for card names
        tessedit_ocr_engine_mode: '2', // LSTM only for better accuracy
        classify_bln_numeric_mode: '0'
      } as any);
      this.initialized = true;
      console.log('OCR Worker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OCR worker:', error);
      throw error;
    }
  }

  async recognizeText(imageData: ImageData): Promise<{ text: string; confidence: number }> {
    if (!this.worker) {
      throw new Error('OCR Worker not initialized');
    }

    try {
      // Convert ImageData to canvas for Tesseract
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Could not get canvas context');
      
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);

      const { data } = await this.worker.recognize(canvas);
      
      return {
        text: data.text.trim(),
        confidence: data.confidence / 100 // Convert to 0-1 range
      };
    } catch (error) {
      console.error('OCR recognition failed:', error);
      throw error;
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

// Singleton instance
let ocrWorkerInstance: OCRWorker | null = null;

export async function getOCRWorker(): Promise<OCRWorker> {
  if (!ocrWorkerInstance) {
    ocrWorkerInstance = new OCRWorker();
    await ocrWorkerInstance.initialize();
  }
  return ocrWorkerInstance;
}

export async function recognizeCardName(imageData: ImageData): Promise<{ text: string; confidence: number }> {
  const worker = await getOCRWorker();
  return worker.recognizeText(imageData);
}