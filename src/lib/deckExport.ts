/**
 * Export deck to text format
 */
export function exportDeckToText(cards: any[]): string {
  const lines: string[] = [];
  
  // Group cards by category
  const commander = cards.filter(c => c.is_commander);
  const mainboard = cards.filter(c => !c.is_commander && !c.is_sideboard);
  const sideboard = cards.filter(c => c.is_sideboard);
  
  // Add commander section
  if (commander.length > 0) {
    lines.push('Commander');
    commander.forEach(c => {
      lines.push(`${c.quantity} ${c.card_name}`);
    });
    lines.push('');
  }
  
  // Add mainboard
  if (mainboard.length > 0) {
    lines.push('Deck');
    mainboard.forEach(c => {
      lines.push(`${c.quantity} ${c.card_name}`);
    });
  }
  
  // Add sideboard
  if (sideboard.length > 0) {
    lines.push('');
    lines.push('Sideboard');
    sideboard.forEach(c => {
      lines.push(`${c.quantity} ${c.card_name}`);
    });
  }
  
  return lines.join('\n');
}
