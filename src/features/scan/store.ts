import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScannedCard {
  id: string;
  cardId: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  imageUrl: string;
  priceUsd?: number;
  quantity: number;
  scannedAt: string;
  confidence: number;
}

export interface ScanSettings {
  autoCapture: boolean;
  autoAdd: boolean;
  preferPrinting: 'newest' | 'cheapest' | 'last_used';
  sharpnessThreshold: number;
  addToCollection: boolean;
  addToDeck: boolean;
  selectedDeckId: string;
  addToStorage: boolean;
  selectedStorageId: string;
}

interface ScanState {
  // Settings
  settings: ScanSettings;
  updateSettings: (settings: Partial<ScanSettings>) => void;
  
  // Recent scans
  recentScans: ScannedCard[];
  addRecentScan: (card: ScannedCard) => void;
  removeRecentScan: (scanId: string) => void;
  updateScanQuantity: (scanId: string, quantity: number) => void;
  clearRecentScans: () => void;
  
  // Scanning state
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  
  // Last OCR results
  lastOCRText: string;
  lastOCRConfidence: number;
  setLastOCR: (text: string, confidence: number) => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      // Default settings
      settings: {
        autoCapture: true,
        autoAdd: false,
        preferPrinting: 'newest',
        // Laplacian variance a frame must clear before auto-capture fires. This
        // read 50 while `CameraScanView` passed a hardcoded 120 straight to the
        // hook, so the stored value was never used; 120 is the number the
        // scanner has actually been running on, and it is now the one in force.
        sharpnessThreshold: 120,
        addToCollection: true,
        addToDeck: false,
        selectedDeckId: '',
        addToStorage: false,
        selectedStorageId: ''
      },
      
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        })),
      
      // Recent scans management
      recentScans: [],
      
      addRecentScan: (card) =>
        set((state) => {
          const existing = state.recentScans.find(s => s.cardId === card.cardId);
          
          if (existing) {
            // Update quantity if same card scanned within 10 seconds
            const timeDiff = Date.now() - new Date(existing.scannedAt).getTime();
            if (timeDiff < 10000) {
              return {
                recentScans: state.recentScans.map(s =>
                  s.id === existing.id
                    ? { ...s, quantity: s.quantity + 1, scannedAt: card.scannedAt }
                    : s
                )
              };
            }
          }
          
          // Add new scan, keep only last 10
          return {
            recentScans: [card, ...state.recentScans.slice(0, 9)]
          };
        }),
      
      removeRecentScan: (scanId) =>
        set((state) => ({
          recentScans: state.recentScans.filter(scan => scan.id !== scanId)
        })),
      
      updateScanQuantity: (scanId, quantity) =>
        set((state) => ({
          recentScans: state.recentScans.map(scan =>
            scan.id === scanId ? { ...scan, quantity } : scan
          )
        })),
      
      clearRecentScans: () => set({ recentScans: [] }),
      
      // Scanning state
      isScanning: false,
      setIsScanning: (scanning) => set({ isScanning: scanning }),
      
      // OCR results
      lastOCRText: '',
      lastOCRConfidence: 0,
      setLastOCR: (text, confidence) =>
        set({ lastOCRText: text, lastOCRConfidence: confidence })
    }),
    {
      name: 'scan-store',
      /**
       * v1 lifts the persisted sharpness threshold off the old unused default.
       *
       * `settings` is persisted whole, so anyone who has opened the scanner
       * already carries `sharpnessThreshold: 50` in localStorage. Now that the
       * camera actually reads the setting, leaving 50 in place would quietly
       * make auto-capture fire on blurrier frames than it ever has. The
       * migration only touches the stale value.
       */
      version: 1,
      migrate: (persisted: any, version: number) => {
        if (version < 1 && persisted?.settings?.sharpnessThreshold === 50) {
          return {
            ...persisted,
            settings: { ...persisted.settings, sharpnessThreshold: 120 }
          };
        }
        return persisted;
      },
      partialize: (state) => ({
        settings: state.settings,
        recentScans: state.recentScans
      })
    }
  )
);
