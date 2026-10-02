import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { productsApi, reviewsApi } from '@/lib/api';
import { productImageSrc } from '@/lib/productImages';
import { productSlug, parseProductId } from '@/lib/productSlug';
import { finalUnitPrice } from '@/lib/price';

const BASE = 'https://www.mahalaxmifashionhub.com';

// Server-rendered SEO for each product page. The page itself is a client component,
// so this layout supplies per-product <title>/<meta>/OpenGraph that Google can read.
// Title & description come from the product's own name/description (admin-editable) —
// no code change needed when new products are added.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const { product } = await productsApi.getById(parseProductId(params.id));
    if (!product) return {};

    const name = product.name?.trim() || 'Product';
    const rawDesc = (product.description
      || `Buy ${name} online at Mahalaxmi Fashion Hub — premium ethnic & fashion wear with fast delivery across India.`)
      .replace(/\s+/g, ' ').trim();
    const description = rawDesc.length > 160 ? rawDesc.slice(0, 157) + '…' : rawDesc;

    const imgSrc = productImageSrc(product.image);
    const ogImage = imgSrc
      ? (/^https?:/i.test(imgSrc) ? imgSrc : `${BASE}${imgSrc}`)
      : `${BASE}/og-image.jpg`;
    // Canonical always points to the pretty slug URL — so both /products/42 and
    // /products/red-saree-42 consolidate to one URL in Google's eyes.
    const canonical = `/products/${productSlug(product.name, product.dbId)}`;
    const fullTitle = `${name} | Mahalaxmi Fashion Hub`;

    // Open Graph — yani jo Facebook, Instagram aur WhatsApp link ke saath
    // dikhate hain.
    //
    // Pehle ye saare tag `other` se bheje jate the. Next `other` ki har cheez
    // ko <meta NAME="og:title"> likhta hai (maine next/dist/lib/metadata/
    // generate/basic.js me dekha: wo seedha `name` paas karta hai). Open Graph
    // ka niyam PROPERTY maangta hai, name nahi - to Facebook in tagon ko padhta
    // hi nahi tha.
    //
    // Aur kyunki yahan apna openGraph block tha hi nahi, root wala jyon ka
    // tyon utar aata tha. Natija: har product ke link par Facebook ko mukhya
    // panne ka naam, mukhya panne ka byora aur mukhya panne ki tasveer dikhti
    // thi - 440 alag products, saare share par ek jaisi.
    //
    // Ab openGraph se jata hai, jise Next property= ke saath likhta hai.
    // `type` jaan-boojh kar nahi diya: Next ki soochi me 'product' hai hi nahi
    // aur koi anjaan type dene par wo build me error fenk deta hai; type na ho
    // to Facebook khud 'website' maan leta hai, jo galat naam-tasveer dikhane
    // se behtar hai.
    const price = finalUnitPrice(product);
    const soldOut = String(product.stock ?? '').trim().toLowerCase() === 'out of stock';

    return {
      title: name,
      description,
      alternates: { canonical },
      openGraph: {
        siteName: 'Mahalaxmi Fashion Hub',
        locale: 'en_IN',
        title: fullTitle,
        description,
        url: `${BASE}${canonical}`,
        images: [{ url: ogImage, width: 1200, height: 630, alt: name }],
      },
      // Facebook ke apne product tag. Inhe Next sirf name= se likh pata hai,
      // property= se nahi, isliye Facebook inpar bharosa nahi karega. Rehne
      // diye kyunki inka koi nuksan nahi aur daam-stock dusre paathak (jaise
      // kuch scraper) inhe padh lete hain. Instagram par product URL asal me
      // CATALOGUE se mili hai ya nahi, usi se tay hoti hai - in tagon se nahi.
      other: {
        'product:price:amount': String(price),
        'product:price:currency': 'INR',
        'product:availability': soldOut ? 'out of stock' : 'in stock',
        'product:condition': 'new',
        'product:brand': 'Mahalaxmi Fashion Hub',
        ...(product.sku ? { 'product:retailer_item_id': product.sku } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title: fullTitle,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {};
  }
}

// Jin category naamon ka apna panna sach me maujood hai.
const CATEGORY_ROUTES = new Set(['women', 'men', 'kids', 'beauty', 'fabrics', 'more']);

// Server-rendered Product + BreadcrumbList JSON-LD. Emitting it here (a server component)
// puts the structured data in the initial HTML — fully crawlable without JS — and includes
// live price, stock and aggregate rating. Kept out of the client page to avoid duplicates.
async function buildJsonLd(idParam: string): Promise<string | null> {
  try {
    const id = parseProductId(idParam);
    const { product } = await productsApi.getById(id);
    if (!product) return null;

    const price = finalUnitPrice(product);
    const outOfStock = (product.stock || '').toLowerCase().includes('out of stock');
    const imgSrc = productImageSrc(product.image);
    const image = imgSrc
      ? (/^https?:/i.test(imgSrc) ? imgSrc : `${BASE}${imgSrc}`)
      : `${BASE}/og-image.jpg`;
    const canonical = `${BASE}/products/${productSlug(product.name, product.dbId)}`;
    const today = new Date().toISOString().split('T')[0];

    let reviewCount = 0;
    let ratingValue = 0;
    let reviewList: import('@/types').Review[] = [];
    try {
      const rev = await reviewsApi.getByProduct(id);
      reviewList = rev.reviews ?? [];
      reviewCount = reviewList.length;
      if (reviewCount > 0)
        ratingValue = Math.round((reviewList.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount) * 10) / 10;
    } catch { /* reviews unavailable — omit aggregateRating */ }

    const productLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description || product.name,
      image,
      sku: product.sku || String(product.dbId),
      brand: { '@type': 'Brand', name: 'Mahalaxmi Fashion Hub' },
      offers: {
        '@type': 'Offer',
        url: canonical,
        priceCurrency: 'INR',
        price,
        // Google's Merchant listings check wants the price window's start as well
        // as its end. The shop has no record of when a price last changed, and
        // inventing a past date would be a claim we cannot stand behind, so the
        // window is simply "from today, for the next 30 days" — which is what
        // priceValidUntil below has always said in the other direction.
        validFrom: today,
        priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        availability: outOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'Mahalaxmi Fashion Hub' },
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingRate: { '@type': 'MonetaryAmount', value: price >= 999 ? 0 : 60, currency: 'INR' },
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
            transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 7, unitCode: 'DAY' },
          },
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'IN',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: 7,
          returnMethod: 'https://schema.org/ReturnByMail',
          returnFees: 'https://schema.org/FreeReturn',
        },
      },
    };
    if (reviewCount > 0) {
      productLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue,
        reviewCount,
        bestRating: 5,
        worstRating: 1,
      };
      // Individual review snippets — richer star results in Google Search.
      productLd.review = reviewList.slice(0, 10).map(r => ({
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { '@type': 'Person', name: r.customerName || 'Verified Buyer' },
        ...(r.text ? { reviewBody: r.text } : {}),
        ...(r.createdAt ? { datePublished: String(r.createdAt).split('T')[0] } : {}),
      }));
    }

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
        { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE}/products` },
        ...(product.category
          // Pehle category ka naam seedha URL bana diya jata tha - "Nighty"
          // se /nighty, "Saree" se /saree. Aise koi panne hain hi nahi, to
          // breadcrumb ka teesra paaydaan 404 par le jata tha, aur 404 par
          // jaane wala breadcrumb Google poora hi radd kar deta hai. Ab jin
          // category ka apna panna hai bas unka link, baaki ke liye /products
          // par chhanta hua panna.
          ? [{
              '@type': 'ListItem', position: 3, name: product.category,
              item: CATEGORY_ROUTES.has(product.category.toLowerCase().trim())
                ? `${BASE}/${product.category.toLowerCase().trim()}`
                : `${BASE}/products?category=${encodeURIComponent(product.category.toLowerCase().trim())}`,
            }]
          : []),
        { '@type': 'ListItem', position: product.category ? 4 : 3, name: product.name },
      ],
    };

    // JSON.stringify leaves "<" alone, so a product name holding "</script>"
    // would close this tag early and whatever followed would run as script.
    // Escaping it keeps the JSON valid and the tag unbreakable.
    return JSON.stringify([productLd, breadcrumbLd]).replace(/</g, '\\u003c');
  } catch {
    return null;
  }
}

export default async function ProductLayout({
  children, params,
}: { children: React.ReactNode; params: { id: string } }) {
  // A URL for a product that does not exist used to answer 200 with the
  // homepage's title and a line of body text reading "Product not found." To
  // Google that is a real page, so every mistyped or retired product URL was
  // another thin duplicate in the index. Answer 404 and it goes away.
  const id = parseProductId(params.id);
  if (!id) notFound();
  try {
    const { product } = await productsApi.getById(id);
    if (!product) notFound();
  } catch (e) {
    // notFound() works by throwing — let it through rather than swallowing it.
    if ((e as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw e;
    // A backend hiccup is not a missing product; show the page and let the
    // client retry rather than telling Google the product is gone.
  }

  const jsonLd = await buildJsonLd(params.id);
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      {children}
    </>
  );
}
