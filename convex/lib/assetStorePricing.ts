/** Creative Network stock audio: list = 3× generate cost; split 30/70. */

export const ASSET_STORE_PRICE_MULTIPLIER = 3;
export const ASSET_STORE_PLATFORM_SHARE = 0.3;
export const ASSET_STORE_SELLER_SHARE = 0.7;

export function assetStorePriceCredits(generateCredits: number): number {
  const gen = Math.max(0, Number(generateCredits) || 0);
  return Math.max(1, Math.round(gen * ASSET_STORE_PRICE_MULTIPLIER));
}

export function assetStoreSplit(priceCredits: number): {
  platformCredits: number;
  sellerCredits: number;
} {
  const price = Math.max(1, Math.round(Number(priceCredits) || 0));
  const platformCredits = Math.round(price * ASSET_STORE_PLATFORM_SHARE * 100) / 100;
  const sellerCredits = Math.round((price - platformCredits) * 100) / 100;
  return { platformCredits, sellerCredits };
}

export function sellerPayoutCentsFromCredits(
  sellerCredits: number,
  creditPriceCents: number,
): number {
  return Math.round(
    Math.max(0, Number(sellerCredits) || 0) * Math.max(1, Number(creditPriceCents) || 50),
  );
}
