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

export const KIDS_TAXONOMY: Subcategory[] = [
  { name: 'Kids Clothing', variants: ['Girls', 'Boys', 'Babies', 'Clothing Sets', 'Frocks & Dresses', 'T-Shirt & Polos'] },
  { name: 'Kids Toys', variants: ['Toys & Games', 'Summer Picks', 'Best Sellers', 'Baby Gears'] },
  { name: 'Kids Accessories', variants: ['Bags & Backpacks', 'Kids Accessories', 'Party Items'] },
  { name: 'Baby Care', variants: ['Baby Bedding & Accessories', 'Newborn Care', 'Diapers', 'Baby Mosquito nets', 'Baby Dry Sheets'] },
];

export const BEAUTY_TAXONOMY: Subcategory[] = [
  { name: 'Makeup', variants: ['Lipstick', 'Eye Shadow and Liner', 'Face Makeup', 'Makeup Kits & Combos', 'Hair Curlers', 'Nail Makeup', 'Brushes & Accessories', 'Hair Removal', 'Perfumes & More'] },
  { name: 'Personal Care', variants: ['Body Lotion', 'Hair Oil & Shampoo', 'Whitening Creams', 'Straighteners & Dryers', 'Face Oil & Serum', 'Face Wash', 'Face Masks & Peels', 'Soaps & Scrubs'] },
  { name: 'Healthcare', variants: ['Oral Care', 'Winter Healthcare', 'Ear Cleaner', 'Health Monitor & Massagers', 'Foot care', 'Sexual Wellness', 'Ayurveda & Nutrition', 'Sanitary Pads & More'] },
  { name: 'Baby & Mom', variants: ['Baby Care Essentials', 'Mom Care'] },
  { name: 'Mens Care', variants: ['Trimmers', 'Beard Oil', 'Men Perfumes & Deodorant', 'Hair Gels, Wax & Spray', "Men's Face & Body Care", 'Budget Grooming Kits'] },
];

export const MORE_TAXONOMY: Subcategory[] = [
  { name: 'Home Decor', variants: ['Covers', 'Key Holders', 'Artificial Plants', 'Pooja Needs', 'Party Supplies', 'Wallpapers & Stickers', 'Showpieces & Idols', 'Clocks & Wall Decor'] },
  { name: 'Kitchen & Appliances', variants: ['Storage & Organizers', 'Cookware', 'Kitchen Tools', 'Kitchen Appliances', 'Dinnerware', 'Glasses & Barware', 'Kitchen Linen', 'Home Appliances'] },
  { name: 'Home Textiles', variants: ['Bedsheets', 'Curtains & Accessories', 'Doormats & Carpets', 'Pillow, Cushion & Covers', 'Blankets & Comforters'] },
  { name: 'Home Improvement', variants: ['Bathroom Accessories', 'Cleaning Supplies', 'Gardening', 'Home Tools', 'Insect Protection'] },
  { name: 'Furniture', variants: ['Shoe Racks', 'Study Tables', 'Collapsible Wardrobes', 'Wall Shelves', 'Home Temple', 'Hammock Swing'] },
  { name: 'Jewellery', variants: ['Jewellery Sets', 'Earrings', 'Mangalsutras', 'Necklaces & Chains', 'Bangles & Bracelets', 'Anklets & Nosepins', 'Kamarbandh & Maangtika'] },
  { name: 'Men Accessories', variants: ['Men Watches', 'Wallets', 'Men Jewellery', 'Sunglasses & Spectacle Frames', 'Belts'] },
  { name: 'Women Accessories', variants: ['Women Watches', 'Hair Accessories', 'Women Belts', 'Sunglasses & Spectacle Frames', 'Scarves, Stoles & Gloves'] },
  { name: 'Women Footwear', variants: ['Heels and Sandals', 'Flats', 'Boots', 'Flipflops & Slippers', 'Bellies and Ballerinas'] },
  { name: 'Men Footwear', variants: ['Men Casual Shoes', 'Men Sports Shoes', 'Men Flip Flops and Sandals', 'Men Formal Shoes', 'Loafers'] },
  { name: 'Kids Footwear', variants: ['Boys Shoes', 'Girls Shoes', 'Casual Shoes', 'Flipflops & Slippers', 'Sandals'] },
  { name: 'Women Bags', variants: ['Backpacks', 'Handbags', 'Slingbags', 'Wallets', 'Clutches'] },
  { name: 'Men Bags', variants: ['Backpacks', 'Waist Bags', 'Crossbody Bags & Sling Bags'] },
  { name: 'Travel Bags, Luggage and Accessories', variants: ['Duffel & Trolley Bags', 'Laptop & Messenger Bags'] },
  { name: 'Audio & Mobiles', variants: ['Neckband', 'Speakers', 'Cases & Covers', 'Bluetooth Earbuds', 'Wired Earphone'] },
  { name: 'Accessories', variants: ['Mobile Holders', 'Mobile Chargers & Cables', 'Power Banks', 'Microphone', 'Selfie Stick & Ringlight', 'Tripod & Monopod', 'Extension Cord', 'Screen Expanders & Magnifiers'] },
  { name: 'Watches', variants: ['Analog Watches', 'Digital Watches', 'Sport Watches', 'Couple Watch', 'Bands & Boxes'] },
];

// Returns the taxonomy for a given top-level category (empty if none defined).
export function getTaxonomy(category: string): Subcategory[] {
  switch (category.toLowerCase()) {
    case 'women':  return WOMEN_TAXONOMY;
    case 'men':    return MEN_TAXONOMY;
    case 'kids':   return KIDS_TAXONOMY;
    case 'beauty': return BEAUTY_TAXONOMY;
    case 'more':   return MORE_TAXONOMY;
    default:       return [];
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
