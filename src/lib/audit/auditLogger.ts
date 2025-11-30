import { supabase } from '@/integrations/supabase/client';

export type AuditAction = 
  | 'deck.create'
  | 'deck.update'
  | 'deck.delete'
  | 'deck.share'
  | 'collection.add'
  | 'collection.remove'
  | 'collection.bulk_import'
  | 'listing.create'
  | 'listing.update'
  | 'listing.delete'
  | 'sale.record'
  | 'wishlist.add'
  | 'wishlist.remove'
  | 'storage.assign'
  | 'storage.create'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.password_change'
  | 'settings.update';

export interface AuditLogEntry {
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit logging system for tracking sensitive user actions
 * Records all important operations for security and compliance
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private userId: string | null = null;

  private constructor() {
    this.initializeUser();
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  private async initializeUser() {
    const { data: { session } } = await supabase.auth.getSession();
    this.userId = session?.user?.id || null;
  }

  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Ensure we have current user
      if (!this.userId) {
        const { data: { session } } = await supabase.auth.getSession();
        this.userId = session?.user?.id || null;
      }

      if (!this.userId) {
        console.warn('Audit log: No user ID available');
        return;
      }

      const { error } = await supabase
        .from('activity_log')
        .insert({
          user_id: this.userId,
          type: entry.action,
          entity: entry.entityType,
          entity_id: entry.entityId,
          meta: entry.metadata || {}
        });

      if (error) {
        console.error('Audit log error:', error);
      }
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  /**
   * Log deck operations
   */
  async logDeckCreate(deckId: string, deckName: string, format: string): Promise<void> {
    await this.log({
      action: 'deck.create',
      entityType: 'deck',
      entityId: deckId,
      metadata: { name: deckName, format }
    });
  }

  async logDeckUpdate(deckId: string, changes: Record<string, any>): Promise<void> {
    await this.log({
      action: 'deck.update',
      entityType: 'deck',
      entityId: deckId,
      metadata: { changes }
    });
  }

  async logDeckDelete(deckId: string, deckName: string): Promise<void> {
    await this.log({
      action: 'deck.delete',
      entityType: 'deck',
      entityId: deckId,
      metadata: { name: deckName }
    });
  }

  async logDeckShare(deckId: string, slug: string): Promise<void> {
    await this.log({
      action: 'deck.share',
      entityType: 'deck',
      entityId: deckId,
      metadata: { slug }
    });
  }

  /**
   * Log collection operations
   */
  async logCollectionAdd(cardId: string, cardName: string, quantity: number): Promise<void> {
    await this.log({
      action: 'collection.add',
      entityType: 'collection',
      entityId: cardId,
      metadata: { cardName, quantity }
    });
  }

  async logCollectionRemove(cardId: string, cardName: string, quantity: number): Promise<void> {
    await this.log({
      action: 'collection.remove',
      entityType: 'collection',
      entityId: cardId,
      metadata: { cardName, quantity }
    });
  }

  async logBulkImport(cardCount: number, source: string): Promise<void> {
    await this.log({
      action: 'collection.bulk_import',
      entityType: 'collection',
      entityId: 'bulk',
      metadata: { cardCount, source }
    });
  }

  /**
   * Log marketplace operations
   */
  async logListingCreate(listingId: string, cardName: string, price: number): Promise<void> {
    await this.log({
      action: 'listing.create',
      entityType: 'listing',
      entityId: listingId,
      metadata: { cardName, price }
    });
  }

  async logSaleRecord(saleId: string, cardName: string, salePrice: number, platform: string): Promise<void> {
    await this.log({
      action: 'sale.record',
      entityType: 'sale',
      entityId: saleId,
      metadata: { cardName, salePrice, platform }
    });
  }

  /**
   * Log authentication events
   */
  async logLogin(): Promise<void> {
    await this.log({
      action: 'auth.login',
      entityType: 'auth',
      entityId: this.userId || 'unknown'
    });
  }

  async logPasswordChange(): Promise<void> {
    await this.log({
      action: 'auth.password_change',
      entityType: 'auth',
      entityId: this.userId || 'unknown'
    });
  }

  /**
   * Get audit trail for current user
   */
  async getUserAuditTrail(limit: number = 100) {
    if (!this.userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch audit trail:', error);
      return [];
    }

    return data || [];
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();
