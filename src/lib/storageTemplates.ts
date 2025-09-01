import { StorageTemplate } from "@/types/storage";

export const DEFAULT_STORAGE_TEMPLATES: StorageTemplate[] = [
  {
    id: 'long-box-a-z',
    name: 'Long Box A-Z',
    type: 'box',
    icon: 'Package',
    color: '#8B5CF6',
    slots: Array.from({ length: 26 }, (_, i) => ({
      name: String.fromCharCode(65 + i), // A-Z
      position: i
    }))
  },
  {
    id: 'binder-12-pages',
    name: 'Binder (12 Pages)',
    type: 'binder',
    icon: 'Book',
    color: '#06B6D4',
    slots: Array.from({ length: 12 }, (_, i) => ({
      name: `Page ${i + 1}`,
      position: i
    }))
  },
  {
    id: 'deckbox-simple',
    name: 'Deckbox',
    type: 'deckbox',
    icon: 'Box',
    color: '#F59E0B',
    slots: []
  },
  {
    id: 'color-boxes-wubrg',
    name: 'Color Boxes (WUBRG + C)',
    type: 'box',
    icon: 'Palette',
    color: '#EC4899',
    slots: [
      { name: 'White', position: 0 },
      { name: 'Blue', position: 1 },
      { name: 'Black', position: 2 },
      { name: 'Red', position: 3 },
      { name: 'Green', position: 4 },
      { name: 'Colorless', position: 5 }
    ]
  },
  {
    id: 'mythic-binder',
    name: 'Mythic Binder',
    type: 'binder',
    icon: 'Crown',
    color: '#DC2626',
    slots: Array.from({ length: 6 }, (_, i) => ({
      name: `Page ${i + 1}`,
      position: i
    }))
  }
];

export function getTemplateById(id: string): StorageTemplate | undefined {
  return DEFAULT_STORAGE_TEMPLATES.find(template => template.id === id);
}

export function getTemplatesByType(type: string): StorageTemplate[] {
  return DEFAULT_STORAGE_TEMPLATES.filter(template => template.type === type);
}