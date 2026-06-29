// Category taxonomy: subcategories and their variants.
// Single source of truth for the admin subcategory/variant pickers and the storefront menus.

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

export const MEN_TAXONOMY: Subcategory[] = [
  { name: 'Top Wear', variants: ['Summer T-Shirts', 'Shirts', 'T-Shirts Combos'] },
  { name: 'Bottom Wear', variants: ['Jeans', 'Cargos/Trousers', 'Dhotis/Lungis'] },
  { name: 'Ethnic Wear', variants: ['Kurtas', 'Kurta Sets', 'Nehru Jacket'] },
  { name: 'Innerwear', variants: ['Vests', 'Briefs', 'Boxers'] },
  { name: 'Sports Wear', variants: ['Trackpants', 'Tracksuits', 'Gym Tshirts'] },
  { name: 'Night Wear', variants: ['Pyjamas', 'Night Shorts', 'Nightsuits'] },
  { name: 'Winter Wear', variants: ['Shrugs', 'Jackets', 'Sweatshirts'] },
  { name: 'Combo Store', variants: ['Rakhi Specials', 'Shirts Combo', 'Innerwear Combo'] },
  { name: 'Accessories', variants: ['All Accessories', 'Watches', 'Wallets', 'Jewellery', 'Sunglasses & Spectacle Frames', 'Belts'] },
  { name: 'Footwear', variants: ['Men Footwear', 'Men Casual Shoes', 'Men Sports Shoes', 'Men Flip Flops and Sandals', 'Men Formal Shoes', 'Loafers'] },
];

// Returns the taxonomy for a given top-level category (empty if none defined).
export function getTaxonomy(category: string): Subcategory[] {
  switch (category.toLowerCase()) {
    case 'women': return WOMEN_TAXONOMY;
    case 'men':   return MEN_TAXONOMY;
    default:      return [];
  }
}

// Flat list of subcategory + variant names — used to populate admin subcategory suggestions.
export function taxonomySuggestions(category: string): string[] {
  const out: string[] = [];
  for (const s of getTaxonomy(category)) {
    out.push(s.name);
    for (const v of s.variants) out.push(v);
  }
  return out;
}
