import type { Metadata } from 'next';
import Link from 'next/link';
import { SHOP, SHIPPING, RETURNS, SIZES, DELIVERY_TOTAL_MIN, DELIVERY_TOTAL_MAX } from '@/lib/shopFacts';
import ProductsClient from '@/components/products/ProductsClient';
import { toListingProducts } from '@/lib/listingProduct';
import { fetchAllProducts } from '@/lib/adminPaged';

export const revalidate = 300;

interface Props {
  searchParams: { category?: string; subcategory?: string; q?: string; bestSeller?: string };
}

// ?subcategory= carries one name or several separated by commas. Several is how
// a homepage tile points at a group that has no curated collection page of its
// own — "Nightwear" is Cotton Nighty and Hosiery Nighty and Night Suit, not one
// subcategory and not the whole shop.
function subcategoriesFromQuery(value?: string): string[] {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

const normSub = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// Jin category naamon ka apna panna sach me maujood hai. Baaki sab /products
// par hi rehte hain.
const CATEGORY_ROUTES = new Set(['women', 'men', 'kids', 'beauty', 'fabrics', 'more']);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const subs = subcategoriesFromQuery(searchParams.subcategory);

  const label = subs.length > 0
    ? subs.join(' & ')
    : searchParams.category
      ? searchParams.category.charAt(0).toUpperCase() + searchParams.category.slice(1).replace(/-/g, ' ')
      : searchParams.bestSeller === 'true' ? 'Best Sellers' : 'All Products';

  // A subcategory listing is its own page, so it gets its own canonical. Pointing
  // it at /products told Google every tile was the same page and dropped them all
  // from the index.
  //
  // Subcategory ki soochi tarteeb me lagti hai: ?subcategory=A,B aur
  // ?subcategory=B,A wahi maal dikhate hain, par bina tarteeb ke do alag
  // canonical ban jate the - Google ke liye do alag panne, dono aadhe-aadhe.
  const subKey = [...subs].sort().join(',');

  // ?category=X ko /X par tabhi bhejte hain jab /X sach me ek panna ho.
  // Pehle har category ko bhej dete the, to ?category=saree apne aap ko /saree
  // batata tha - jo hai hi nahi. Google 404 par canonical dekhta hai aur dono
  // panne gira deta hai; sitemap me teen aise hi URL pade the.
  const cat = (searchParams.category ?? '').toLowerCase().trim();
  const canonical = subs.length > 0
    ? `/products?subcategory=${encodeURIComponent(subKey)}`
    : cat
      ? (CATEGORY_ROUTES.has(cat) ? `/${cat}` : `/products?category=${encodeURIComponent(cat)}`)
      : searchParams.bestSeller === 'true'
        ? '/best-sellers'
        : '/products';

  // Internal search-result pages (?q=...) are thin/duplicate — keep them out of the
  // index so they don't dilute ranking, but still let Google follow the links.
  const isSearch = !!searchParams.q;

  // Catalogue ka mukhya darwaza apna byora nahi likhta tha, to root wala utar
  // aata tha - yaani mukhya panne jaisa hi. Do panne, ek hi snippet.
  const description = subs.length > 0 || cat
    ? `Shop ${label.toLowerCase()} online at Mahalaxmi Fashion Hub. Cash on delivery, 7-day returns and pan-India shipping, with free delivery over ₹999.`
    : 'Browse the full Mahalaxmi Fashion Hub catalogue — cotton nighties, sarees, petticoats, innerwear, footwear and perfume. Cash on delivery, 7-day returns, pan-India shipping.';

  return {
    title: searchParams.q
      ? `Search: ${searchParams.q}`
      : `${label}`,
    description,
    alternates: { canonical },
    ...(isSearch ? { robots: { index: false, follow: true } } : {}),
  };
}

// Catalogue ke panne ke neeche ki likhawat. Har chhanti hui soochi ke liye
// wahi dhaancha, par naam uska apna - taki do alag chhantiyon ka text hubahu
// ek jaisa na ho.
function ListingIntro({ label, count }: { label: string; count: number }) {
  const what = label === 'All Products' ? 'the full catalogue' : label.toLowerCase();
  return (
    <section className="pf-wrap" aria-labelledby="li-heading">
      <div className="pf-inner">
        <h2 id="li-heading" className="pf-h2">Buying {what} at Mahalaxmi Fashion Hub</h2>
        <p className="pf-note" style={{ maxWidth: 760 }}>
          {count > 0 && <>There {count === 1 ? 'is' : 'are'} <strong>{count}</strong> {count === 1 ? 'product' : 'products'} in {what} right now. </>}
          Every piece is checked before it is packed, and ordered from our own shop in {SHOP.city}, {SHOP.state}.
          Cash on Delivery is available everywhere in India, alongside UPI, cards and net banking.
        </p>
        <div className="pf-grid">
          <div className="pf-card">
            <h3 className="pf-h3">Delivery</h3>
            <p className="pf-note" style={{ margin: 0 }}>
              Dispatched in {SHIPPING.processingDaysMin}–{SHIPPING.processingDaysMax} business days via {SHIPPING.courier}.
              Most orders arrive within {DELIVERY_TOTAL_MIN}–{DELIVERY_TOTAL_MAX} business days of being placed.
              Shipping is free above Rs. {SHIPPING.freeAbove} and a flat Rs. {SHIPPING.chargeBelow} below that.
            </p>
          </div>
          <div className="pf-card">
            <h3 className="pf-h3">Sizes</h3>
            <p className="pf-note" style={{ margin: 0 }}>
              Readymade clothing is stocked from {SIZES.range}. {SIZES.note} Each product page carries a size
              chart with bust, waist and hip measurements in inches.
            </p>
          </div>
          <div className="pf-card">
            <h3 className="pf-h3">Returns</h3>
            <p className="pf-note" style={{ margin: 0 }}>
              {RETURNS.windowDays} days from delivery for damaged, defective, wrong or missing items, with an
              original unedited parcel-opening video. Change of mind and size issues are not covered.{' '}
              <Link href={RETURNS.policyPath} className="pf-link">Read the full policy</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function ProductsPage({ searchParams }: Props) {
  // Server ek page me 100 se zyada nahi deta, isliye pageSize: 500 maangne par
  // bhi 103 me se sirf 100 aate the — listing par teen products kabhi dikhte hi
  // nahi the. Ab saare page padhe jaate hain.
  const all = await fetchAllProducts({
    category: searchParams.category,
    bestSeller: searchParams.bestSeller === 'true' ? true : undefined,
  }).catch(() => [] as any[]);

  const subs = subcategoriesFromQuery(searchParams.subcategory);

  // Several subcategories are narrowed here, on the server, so the shopper lands
  // on the group and the sidebar then offers only the subcategories inside it.
  // A single one is left to the client, where it stays a filter the shopper can
  // clear.
  const wanted = new Set(subs.map(normSub));
  const products = subs.length > 1
    ? (all as any[]).filter(p => wanted.has(normSub(p.subcategory ?? '')))
    : all;

  const title = subs.length > 0
    ? subs.join(' & ')
    : searchParams.bestSeller === 'true'
      ? 'Best Sellers'
      : searchParams.category
        ? searchParams.category.charAt(0).toUpperCase() + searchParams.category.slice(1).replace(/-/g, ' ')
        : 'All Products';

  // Khoj ke nateeje ka panna noindex hai, uspar likhne ka koi matlab nahi.
  const showCopy = !searchParams.q;

  return (
    <>
      <ProductsClient
        products={toListingProducts(products as any[])}
        title={title}
        initialQ={searchParams.q ?? ''}
        initialSubcat={subs.length === 1 ? subs[0] : ''}
      />
      {/* Is panne par ek bhi shabd nahi tha - sirf products ka grid.
          Yahi catalogue ka mukhya darwaza hai, aur breadcrumb aur llms.txt
          dono isi par ishara karte hain. Bina kisi likhe shabd ke Google ke
          paas is panne ke baare me batane ko kuch tha hi nahi, aur AI ke jawab
          me ye kabhi aa hi nahi sakta tha. */}
      {showCopy && <ListingIntro label={title} count={products.length} />}
    </>
  );
}
