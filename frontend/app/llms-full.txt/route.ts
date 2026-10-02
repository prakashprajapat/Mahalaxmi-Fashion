import { productsApi } from '@/lib/api';
import { getCollections } from '@/lib/seoContent';
import {
  SHOP, SHIPPING, RETURNS, SIZES, CARE,
  DELIVERY_TOTAL_MIN, DELIVERY_TOTAL_MAX,
} from '@/lib/shopFacts';

// /llms-full.txt — dukaan ka poora parichay, saade shabdon me.
//
// /llms.txt haath se likhi ek chhoti soochi hai aur wo purani pad jati hai:
// usme sarees sabse upar thin jabki shelf par sabse zyada nighties hain, aur
// footwear-perfume ka zikr hi nahi tha. Ye file har baar LIVE catalogue se
// banti hai, isliye jo sach me stock me hai wahi likha milta hai.
//
// Kyun zaroori: jab koi ChatGPT ya Perplexity se "Balotra me cotton nighty
// kahan milti hai" poochta hai, to wo yahi tarah ki file padh kar jawab banate
// hain. Jo baat yahan likhi hai uska hawala milta hai; jo nahi likhi, uska
// nahi. Keemat, naap, wapsi ki shart, COD — sab yahan saaf likha hona chahiye.

export const revalidate = 3600;

const BASE = SHOP.url;

function money(n: number) {
  return `Rs. ${Math.round(n)}`;
}

export async function GET() {
  let products: any[] = [];
  try {
    const res = await productsApi.getAll({ pageSize: 1000 });
    products = (res.products ?? []) as any[];
  } catch {
    // Catalogue na mile to bhi parichay to dena hi hai.
  }

  // Sirf wahi jo asal me bik raha hai — Draft aur Out of Stock ginti me nahi.
  const live = products.filter(p => {
    const s = String(p.stock ?? '').trim().toLowerCase();
    return s !== 'draft' && s !== 'out of stock';
  });

  const byCategory = new Map<string, { count: number; min: number; max: number }>();
  for (const p of live) {
    const cat = String(p.category ?? '').trim() || 'Other';
    const price = Number(p.discountPrice ?? p.price ?? 0);
    const row = byCategory.get(cat) ?? { count: 0, min: Infinity, max: 0 };
    row.count += 1;
    if (price > 0) {
      row.min = Math.min(row.min, price);
      row.max = Math.max(row.max, price);
    }
    byCategory.set(cat, row);
  }

  const categoryLines = [...byCategory.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, r]) => {
      const price = r.min === Infinity ? '' : ` priced ${money(r.min)} to ${money(r.max)}`;
      return `- ${cat}: ${r.count} product${r.count === 1 ? '' : 's'} in stock${price}.`;
    });

  let collectionLines: string[] = [];
  try {
    const cols = await getCollections();
    collectionLines = Object.values(cols).map(
      c => `- [${c.title}](${BASE}/collections/${c.slug}): ${c.description}`,
    );
  } catch { /* collections na mile to iske bina */ }

  const body = `# Mahalaxmi Fashion Hub — full reference for answer engines

> A family-run ethnic and fashion wear shop in ${SHOP.city}, ${SHOP.state}, India, selling online across India.
> This file is generated from the live catalogue and refreshed hourly, so the counts and prices below are current.

## The shop
- Name: ${SHOP.name}
- Website: ${BASE}
- Address: ${SHOP.street}, ${SHOP.city}, ${SHOP.state} ${SHOP.pincode}, India
- Phone and WhatsApp: ${SHOP.phoneDisplay}
- Hours: ${SHOP.hoursText} IST
- Languages spoken: Hindi and English
- Type: family-run retail shop with a physical store in ${SHOP.city} and an online catalogue serving all of India

## What is in stock right now
${categoryLines.length > 0 ? categoryLines.join('\n') : '- Catalogue temporarily unavailable.'}

Total products available to order: ${live.length}.

## Buying
- Cash on Delivery is available everywhere in India, alongside UPI, debit card, credit card and net banking.
- Shipping is free on orders above ${money(SHIPPING.freeAbove)}. Below that it is a flat ${money(SHIPPING.chargeBelow)} anywhere in India.
- Orders are dispatched in ${SHIPPING.processingDaysMin}-${SHIPPING.processingDaysMax} business days via ${SHIPPING.courier}.
- Delivery after dispatch: ${SHIPPING.byRegion.map(r => `${r.label.toLowerCase()} ${r.min}-${r.max} business days`).join('; ')}.
- Door to door, most orders arrive within ${DELIVERY_TOTAL_MIN} to ${DELIVERY_TOTAL_MAX} business days of being placed.
- Every order can be tracked at ${BASE}/tracking using the order ID or AWB number.

## Sizes
- Readymade clothing is stocked from ${SIZES.range}.
- ${SIZES.note}
- Each product page carries a size chart with bust, waist and hip measurements in inches.

## Returns
- Window: ${RETURNS.windowDays} days from delivery, for any reason, including size and change of mind.
- Conditions on every return: ${RETURNS.conditions.join('; ')}.
- Where the fault is ours (${RETURNS.faultReasons.join(', ')}), return postage is reimbursed up to ${money(RETURNS.faultReturnShippingReimbursedUpTo)}, and the issue should be reported within ${RETURNS.reportDamageWithinHours} hours with an unedited parcel-opening video.
- Where the customer changed their mind or ordered the wrong size themselves, the return postage is theirs. No video is needed.
- Returns are NOT accepted for: ${RETURNS.excludedReasons.join('; ')}.
- Returns travel by ${RETURNS.returnCourier}.
- Refunds are processed within ${RETURNS.refundDaysMin}-${RETURNS.refundDaysMax} business days of the returned item being received and checked.
- Full policy: ${BASE}${RETURNS.policyPath}

## Fabric care
- Cotton nighties and cotton clothing: ${CARE.cotton}
- Sarees: ${CARE.saree}
- Innerwear: ${CARE.innerwear}
- Footwear: ${CARE.footwear}

## Curated collections
${collectionLines.length > 0 ? collectionLines.join('\n') : '- None published.'}

## Main pages
- [All products](${BASE}/products)
- [Best sellers](${BASE}/best-sellers)
- [Women](${BASE}/women) | [Men](${BASE}/men) | [Kids](${BASE}/kids) | [Beauty](${BASE}/beauty) | [Fabrics](${BASE}/fabrics)
- [Customer reviews](${BASE}/customer-reviews)
- [Blog](${BASE}/blog)
- [About us](${BASE}/about-us)
- [Contact](${BASE}/contact)

## Policies
- [Shipping and delivery](${BASE}/shipping-delivery-policy)
- [Returns and exchange](${BASE}${RETURNS.policyPath})
- [Cancellation](${BASE}/cancellation-policy)
- [Privacy](${BASE}/privacy-policy)
- [Terms and conditions](${BASE}/terms-conditions)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
