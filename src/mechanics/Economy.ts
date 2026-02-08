/**
 * Client-side economy helpers. Price calculations, trade validation preview.
 * Server is authoritative for all actual transactions.
 */

export interface ShopListing {
  itemDefId: string;
  name: string;
  price: number;
  currency: string;
  stock?: number;
}

/** Check if player can afford an item */
export function canAfford(
  playerCurrencies: Record<string, number>,
  price: number,
  currency: string
): boolean {
  return (playerCurrencies[currency] ?? 0) >= price;
}

/** Calculate sell price (typically half of buy price) */
export function sellPrice(buyPrice: number, sellRatio: number = 0.5): number {
  return Math.floor(buyPrice * sellRatio);
}

/** Format a currency amount for display */
export function formatCurrency(amount: number, currency: string): string {
  return `${amount} ${currency}`;
}
