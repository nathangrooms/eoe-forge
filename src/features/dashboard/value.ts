// Dashboard value formatting utilities
export function asUSD(n: number | null | undefined, decimals = 2): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { 
    style: "currency", 
    currency: "USD", 
    maximumFractionDigits: decimals 
  });
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diffInMs / (1000 * 60));
  const hours = Math.floor(diffInMs / (1000 * 60 * 60));
  const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

export function calculateWishlistValue(wishlistItems: any[]): { total: number, items: number, desired: number } {
  if (!wishlistItems || wishlistItems.length === 0) {
    return { total: 0, items: 0, desired: 0 };
  }
  
  let total = 0;
  let items = 0;
  let desired = 0;
  
  wishlistItems.forEach(item => {
    const price = item.card?.prices?.usd ? parseFloat(item.card.prices.usd) : 0;
    const quantity = item.quantity || 1;
    
    total += price * quantity;
    items += 1;
    desired += quantity;
  });
  
  return { total, items, desired };
}