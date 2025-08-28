#!/usr/bin/env node

/**
 * Scryfall Bulk Data Sync Script
 * Downloads and imports all Magic: The Gathering cards from Scryfall's bulk data API
 * into the local cards table for fast searching and collection management.
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://udnaflcohfyljrsgqggy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  colors?: string[];
  color_identity?: string[];
  cmc: number;
  type_line: string;
  oracle_text?: string;
  keywords?: string[];
  legalities: Record<string, string>;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
    border_crop?: string;
  };
  prices?: {
    usd?: string;
    usd_foil?: string;
    usd_etched?: string;
    eur?: string;
    eur_foil?: string;
  };
  rarity: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

interface BulkDataInfo {
  object: string;
  id: string;
  type: string;
  name: string;
  description: string;
  download_uri: string;
  updated_at: string;
  size: number;
  content_type: string;
  content_encoding: string;
}

class ScryfallSync {
  private batchSize = 1000;
  private rateLimitDelay = 100; // ms between requests

  async sync() {
    console.log('🚀 Starting Scryfall bulk data sync...');
    
    try {
      // Get bulk data information
      const bulkData = await this.getBulkDataInfo();
      console.log(`📦 Found bulk data: ${bulkData.name} (${Math.round(bulkData.size / 1024 / 1024)}MB)`);
      
      // Download bulk data
      const cards = await this.downloadBulkData(bulkData.download_uri);
      console.log(`📥 Downloaded ${cards.length} cards`);
      
      // Upsert cards in batches
      await this.upsertCards(cards);
      
      console.log('✅ Sync completed successfully!');
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
      process.exit(1);
    }
  }

  private async getBulkDataInfo(): Promise<BulkDataInfo> {
    console.log('🔍 Fetching bulk data information...');
    
    const response = await fetch('https://api.scryfall.com/bulk-data');
    if (!response.ok) {
      throw new Error(`Failed to fetch bulk data info: ${response.statusText}`);
    }
    
    const data = await response.json();
    const defaultCards = data.data.find((item: BulkDataInfo) => item.type === 'default_cards');
    
    if (!defaultCards) {
      throw new Error('Default cards bulk data not found');
    }
    
    return defaultCards;
  }

  private async downloadBulkData(downloadUri: string): Promise<ScryfallCard[]> {
    console.log('⬇️ Downloading bulk data...');
    
    const response = await fetch(downloadUri);
    if (!response.ok) {
      throw new Error(`Failed to download bulk data: ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    const cards: ScryfallCard[] = [];
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const card = JSON.parse(line) as ScryfallCard;
          // Filter out non-paper cards and tokens
          if (card.type_line && !card.type_line.includes('Token') && card.set) {
            cards.push(card);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to parse card: ${line.substring(0, 100)}...`);
        }
      }
    }
    
    return cards;
  }

  private async upsertCards(cards: ScryfallCard[]) {
    console.log(`💾 Upserting ${cards.length} cards in batches of ${this.batchSize}...`);
    
    let processed = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < cards.length; i += this.batchSize) {
      const batch = cards.slice(i, i + this.batchSize);
      const transformedBatch = batch.map(this.transformCard);
      
      const { error } = await supabase
        .from('cards')
        .upsert(transformedBatch, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });
      
      if (error) {
        console.error(`❌ Failed to upsert batch ${i}-${i + batch.length}:`, error);
        throw error;
      }
      
      processed += batch.length;
      const progress = (processed / cards.length * 100).toFixed(1);
      const elapsed = Date.now() - startTime;
      const rate = processed / (elapsed / 1000);
      
      console.log(`📊 Progress: ${progress}% (${processed}/${cards.length}) at ${rate.toFixed(0)} cards/sec`);
      
      // Rate limiting
      if (i + this.batchSize < cards.length) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`⏱️ Completed in ${totalTime.toFixed(1)}s (${(processed / totalTime).toFixed(0)} cards/sec avg)`);
  }

  private transformCard(card: ScryfallCard) {
    return {
      id: card.id,
      oracle_id: card.oracle_id,
      name: card.name,
      set_code: card.set,
      collector_number: card.collector_number,
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      cmc: card.cmc || 0,
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      keywords: card.keywords || [],
      legalities: card.legalities || {},
      image_uris: card.image_uris || {},
      is_legendary: card.type_line?.includes('Legendary') || false,
      prices: card.prices || {},
      rarity: card.rarity,
      updated_at: new Date().toISOString()
    };
  }
}

// Run sync if called directly
if (require.main === module) {
  const sync = new ScryfallSync();
  sync.sync().catch(console.error);
}

export { ScryfallSync };