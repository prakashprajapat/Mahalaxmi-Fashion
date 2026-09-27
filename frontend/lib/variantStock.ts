// Per-variant stock: products.extra_json → "variantMatrix"
// ({"M|Red": 4, "L|Red": 2} or {"M": 6}).
//
// A table where EVERY cell is zero, on a product that is not marked
// "Out of Stock", is not stock data at all. It is what the Add/Edit Product form
// used to save when sizes or colours were selected but the stock table itself was
// left blank — the Total Qty field (e.g. 500) was saved separately, so the
// listing said "In Stock" while this table said nothing was available. Read
// literally, it greys out every size and makes the product impossible to buy,
// and checkout rejects every COD order for it.
//
// So a table like that is treated as "this product is not tracked piece by
// piece" — exactly like a product that never had sizes. A genuinely sold-out
// product carries stock status "Out of Stock", so its zeros are still honoured.
// The backend applies the same rule in StockHelper.
export function trackedVariantMatrix(
  matrix: Record<string, number> | null | undefined,
  stockStatus?: string | null,
): Record<string, number> | null {
  if (!matrix || typeof matrix !== 'object') return null;
  const values = Object.values(matrix).map(v => Number(v) || 0);
  if (values.length === 0) return null;
  const soldOut = String(stockStatus ?? '').trim().toLowerCase().replace(/_/g, ' ') === 'out of stock';
  if (!soldOut && values.every(v => v <= 0)) return null;
  return matrix;
}

// The stock left for one size/colour, or null when the product is not tracked
// piece by piece (so the caller must not treat it as "nothing available").
export function variantStockFor(
  matrix: Record<string, number> | null | undefined,
  key: string,
  stockStatus?: string | null,
): number | null {
  const tracked = trackedVariantMatrix(matrix, stockStatus);
  if (!tracked) return null;
  const value = tracked[key];
  return typeof value === 'number' ? value : null;
}
