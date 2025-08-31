// Scryfall API integration with rate limiting and caching
class ScryfallAPI {
  private static instance: ScryfallAPI;
  private baseUrl = 'https://api.scryfall.com';
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private minDelay = 100; // 10 requests per second max

  static getInstance(): ScryfallAPI {
    if (!ScryfallAPI.instance) {
      ScryfallAPI.instance = new ScryfallAPI();
    }
    return ScryfallAPI.instance;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelay) {
          await this.delay(this.minDelay - timeSinceLastRequest);
        }
        
        try {
          await request();
        } catch (error) {
          console.error('Scryfall request failed:', error);
        }
        
        this.lastRequestTime = Date.now();
      }
    }

    this.isProcessing = false;
  }

  private async makeRequest<T>(url: string, retries = 3): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = async () => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'MTG-Deck-Builder/1.0'
            }
          });

          if (response.status === 429) {
            // Rate limited, retry after delay
            if (retries > 0) {
              await this.delay(1000);
              return this.makeRequest(url, retries - 1);
            }
            throw new Error('Rate limited');
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };

      this.requestQueue.push(request);
      this.processQueue();
    });
  }

  async searchCards(query: string, page = 1): Promise<any> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/cards/search?q=${encodedQuery}&page=${page}&order=name&unique=cards`;
    return this.makeRequest(url);
  }

  async getCard(id: string): Promise<any> {
    const url = `${this.baseUrl}/cards/${id}`;
    return this.makeRequest(url);
  }

  async getCardByName(name: string, set?: string): Promise<any> {
    const encodedName = encodeURIComponent(name);
    let url = `${this.baseUrl}/cards/named?fuzzy=${encodedName}`;
    if (set) {
      url += `&set=${set}`;
    }
    return this.makeRequest(url);
  }

  async getRulings(id: string): Promise<any> {
    const url = `${this.baseUrl}/cards/${id}/rulings`;
    return this.makeRequest(url);
  }

  async getSets(): Promise<any> {
    const url = `${this.baseUrl}/sets`;
    return this.makeRequest(url);
  }

  async getBulkData(): Promise<any> {
    const url = `${this.baseUrl}/bulk-data`;
    return this.makeRequest(url);
  }

  async autocomplete(query: string): Promise<any> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/cards/autocomplete?q=${encodedQuery}`;
    return this.makeRequest(url);
  }

  // Parse deck list from various formats
  static parseDeckList(text: string): Array<{ name: string; quantity: number; sideboard?: boolean }> {
    const lines = text.split('\n').filter(line => line.trim());
    const cards: Array<{ name: string; quantity: number; sideboard?: boolean }> = [];
    let inSideboard = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check for sideboard markers
      if (trimmed.toLowerCase().includes('sideboard') || trimmed.toLowerCase().includes('side:')) {
        inSideboard = true;
        continue;
      }

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        continue;
      }

      // Parse card line - various formats supported
      const patterns = [
        /^(\d+)x?\s+(.+)$/,  // "4x Lightning Bolt" or "4 Lightning Bolt"
        /^(\d+)\s+(.+)$/,    // "4 Lightning Bolt"
        /^(.+?)\s+(\d+)$/,   // "Lightning Bolt 4"
      ];

      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const [, first, second] = match;
          let quantity: number;
          let name: string;

          if (isNaN(parseInt(first))) {
            name = first;
            quantity = parseInt(second);
          } else {
            quantity = parseInt(first);
            name = second;
          }

          if (quantity > 0 && name) {
            cards.push({
              name: name.trim(),
              quantity,
              sideboard: inSideboard
            });
            break;
          }
        }
      }
    }

    return cards;
  }

  // Generate deck export in various formats
  static exportDeck(cards: Array<{ name: string; quantity: number; sideboard?: boolean }>, format: 'arena' | 'modo' | 'text' = 'text'): string {
    const mainboard = cards.filter(c => !c.sideboard);
    const sideboard = cards.filter(c => c.sideboard);

    let result = '';

    if (format === 'arena') {
      result = 'Deck\n';
      result += mainboard.map(c => `${c.quantity} ${c.name}`).join('\n');
      if (sideboard.length > 0) {
        result += '\n\nSideboard\n';
        result += sideboard.map(c => `${c.quantity} ${c.name}`).join('\n');
      }
    } else {
      result = mainboard.map(c => `${c.quantity}x ${c.name}`).join('\n');
      if (sideboard.length > 0) {
        result += '\n\nSideboard:\n';
        result += sideboard.map(c => `${c.quantity}x ${c.name}`).join('\n');
      }
    }

    return result;
  }
}

export const scryfallAPI = ScryfallAPI.getInstance();
export { ScryfallAPI };