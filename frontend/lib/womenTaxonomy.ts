// Women category taxonomy: subcategories and their variants.
// Single source of truth for the admin subcategory picker and the storefront Women menu.

export type Subcategory = { name: string; variants: string[] };

export const WOMEN_TAXONOMY: Subcategory[] = [
  { name: 'Sarees', variants: ['Georgette Sarees', 'Chiffon Sarees', 'Cotton Sarees', 'Net Sarees', 'Silk Sarees', 'New Collection', 'Bridal Sarees'] },
  { name: 'Kurtis', variants: ['Anarkali Kurtis', 'Rayon Kurtis', 'Cotton Kurtis', 'Straight Kurtis', 'Long Kurtis'] },
  { name: 'Kurta Sets', variants: ['Kurta Palazzo Sets', 'Kurta Pant Sets', 'Sharara Sets', 'Anarkali Kurta Sets', 'Cotton Kurta Sets'] },
  { name: 'Dupatta Sets', variants: ['Cotton Sets', 'Rayon Sets'] },
  { name: 'Suits & Dress Material', variants: ['Pakistani Dress Materials', 'Cotton Dress Materials', 'Patiala Dress Materials', 'Banarasi Dress Materials', 'Party Wear Dress Materials'] },
  { name: 'Lehengas', variants: ['Shoppers Favourite', 'Trending Lehengas'] },
  { name: 'Blouses', variants: ['Shoppers Favourite', 'Trending Blouses'] },
  { name: 'Gowns', variants: ['Shoppers Favourite', 'Trending Gowns'] },
  { name: 'Other Ethnic Wear', variants: ['Ethnic Skirts & Bottomwear', 'Ethnic Jackets & Shrugs', 'Islamic Fashion', 'Petticoats', 'Blouse Pieces', 'Dupattas'] },
  { name: 'Topwear', variants: ['Tops & Tunics', 'Dresses', 'T-shirts', 'Gowns', 'Tops & Bottom Sets', 'Shirts', 'Jumpsuits'] },
  { name: 'Bottom Wear', variants: ['Jeans & Jeggings', 'Palazzos', 'Trousers & Pants', 'Leggings', 'Shorts & Skirts', 'New Trends'] },
  { name: 'Winterwear', variants: ['Jackets', 'Sweatshirts', 'Sweaters', 'Capes, Shrug & Ponchos', 'Coats', 'Blazers & Waistcoats'] },
  { name: 'Plus Size', variants: ['Plus Size - Dresses & Gowns', 'Plus Size - Tops & Tees', 'Plus size - Bottomwear'] },
  { name: 'Innerwear', variants: ['Women Bra', 'Women Panties', 'Other Innerwear'] },
  { name: 'Sleepwear', variants: ['Women Nightsuits', 'Women Nightdress', 'Other Sleepwear'] },
  { name: 'Sports Wear', variants: ['Sports Bottomwear', 'Sports Bra', 'Top & Bottom Sets'] },
  { name: 'Maternity Wear', variants: ['Kurti & Topwear', 'Feeding Bras', 'Briefs & Bottomwear'] },
];

// Flat list of subcategory + variant names, used to populate the admin subcategory suggestions.
export function taxonomySuggestions(category: string): string[] {
  if (category.toLowerCase() !== 'women') return [];
  const out: string[] = [];
  for (const s of WOMEN_TAXONOMY) {
    out.push(s.name);
    for (const v of s.variants) out.push(v);
  }
  return out;
}
