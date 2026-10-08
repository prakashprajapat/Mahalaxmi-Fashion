'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { productsApi, reviewsApi, ordersApi } from '@/lib/api';
import { addToCart, getCart } from '@/lib/cart';
import { finalUnitPrice } from '@/lib/price';
import { addToWishlist, isInWishlist, removeFromWishlist } from '@/lib/wishlist';
import { getCustomer, getToken } from '@/lib/auth';
import { productImageSrc, productImageThumb } from '@/lib/productImages';
import { parseProductId } from '@/lib/productSlug';
import { presetColourCode, swatchBackground } from '@/lib/presetColours';
import RelatedProducts from '@/components/product/RelatedProducts';
import BoughtTogether from '@/components/product/BoughtTogether';
import RecentlyViewed from '@/components/product/RecentlyViewed';
import DeliveryEstimate from '@/components/product/DeliveryEstimate';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { trackEvent } from '@/lib/analytics';
import { feedIdFor } from '@/lib/merchantFeed';
import { allSlotPhotos, colourPhotos } from '@/lib/photoExtras';
import type { Product, Review } from '@/types';
import { variantStockFor } from '@/lib/variantStock';
import { formatDateIst } from '@/lib/formatDate';

interface ExtraJson {
  sizes?: string[];
  colors?: string[];
  colorCodes?: Record<string, string>;
  /** Print colour ke saare shades — "Navy/White/Red" → 3 hex. */
  colorShades?: Record<string, string[]>;
  variantMatrix?: Record<string, number>;
  images?: string[];
  productPhotos?: Record<string, string>;
  packImages?: Array<string | Record<string, string>>;
  packColumnPhotos?: Array<Record<string, string>>;
  variantColumns?: Array<Record<string, string>>;
  customColors?: Array<{
    name?: string; code?: string; photo?: string; columnLetter?: string;
    /** Us rang ke apne baaki view. Padhne ka tarika: lib/photoExtras ka colourPhotos. */
    side?: string; back?: string; zoomed?: string;
    [extraSlot: string]: string | undefined;
  }>;
  /** Free-text spec rows the merchant fills in admin. Every one is optional. */
  specs?: Record<string, string>;
}

// Products have no dedicated fabric column yet, so read it out of the text the
// merchant already writes (name / subcategory / description).
//
// It used to fall back to the SUBCATEGORY when it found nothing, which is how a
// bottle of perfume came to be listed as "Fabric: Perfume" - and, since Type
// falls back to the subcategory too, the same word twice. Shoes were made of
// Formal Shoes. A fabric is either named or it is not known, and saying nothing
// is the honest answer; the merchant can always type one in admin, which wins
// over this guess anyway.
const FABRIC_WORDS = ['Cotton', 'Rayon', 'Silk', 'Georgette', 'Chiffon', 'Satin', 'Linen',
  'Denim', 'Velvet', 'Crepe', 'Modal', 'Hosiery', 'Lycra', 'Viscose', 'Khadi', 'Chanderi',
  'Organza', 'Muslin', 'Poplin', 'Jacquard', 'Tissue', 'Tussar', 'Malmal', 'Polyester',
  'Nylon', 'Wool', 'Net'];
function detectFabric(p: Product): string {
  const hay = `${p.name} ${p.subcategory ?? ''} ${p.description ?? ''}`.toLowerCase();
  return FABRIC_WORDS.find(f => hay.includes(f.toLowerCase())) ?? '';
}

function Stars({ n, onClick }: { n: number; onClick?: (v: number) => void }) {
  return (
    <span style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} onClick={() => onClick?.(i)} style={{ color: i <= n ? '#f59e0b' : '#ddd', fontSize: '1.1rem' }}>★</span>
      ))}
    </span>
  );
}

// The server has already fetched this product — layout.tsx does it for the
// title and again for the JSON-LD — and then threw it away, leaving the page
// to fetch it a third time in the browser. Until that landed the whole page
// was the word "Loading…", so tapping a product changed the URL and nothing
// else: same header, same footer, a blank middle for as long as 155 KB of
// JavaScript plus a 250 ms API call takes on a phone. That is the "click
// hota hai lekin aage nahi badhta" people reported.
//
// page.tsx now passes the product in. The effect below still runs and still
// refreshes everything, so if the server copy is missing or stale the browser
// corrects it exactly as before — this only decides what is on screen for the
// first few hundred milliseconds.
/**
 * Wahi photo jo neeche wala effect chunega.
 *
 * activeImg khali se shuru hota tha, isliye product khulte hi ek badi halki
 * 👗 emoji jhalakti thi aur uske baad photo aati thi — har baar. Server product
 * pehle hi bhej chuka hota hai, to photo pehle hi render me daal dete hain:
 * emoji khatam, aur photo HTML me hi aa jati hai (page bhi jaldi dikhta hai).
 */
function firstPhotoOf(p: Product | null): string {
  if (!p) return '';
  let ex: ExtraJson = {};
  try { ex = JSON.parse((p as unknown as { extraJson?: string }).extraJson ?? '{}'); } catch { ex = {}; }
  const isPack = Boolean(p.packOf && p.packOf > 1);
  const firstColour = isPack ? '' : ((ex.colors ?? [])[0] ?? '');
  const custom = (ex.customColors ?? []).find(c => c.name === firstColour);
  return custom?.photo ? (productImageSrc(custom.photo) || custom.photo) : productImageSrc(p.image);
}

export default function ProductDetail({ params, initialProduct = null }: { params: { id: string }; initialProduct?: Product | null }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [extra, setExtra] = useState<ExtraJson>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [activeImg, setActiveImg] = useState(() => firstPhotoOf(initialProduct));
  // Optimiser photo na padh paye to asli file dikhao — dekhiye ProductCard.
  const [heroRaw, setHeroRaw] = useState(false);

  // Has the photo the customer is actually looking at arrived yet?
  //
  // Until it has, only that one is put on the page. Mounting all ten at once
  // is what made the first one sit blurred: product photos are fetched by
  // their full https address, so each one Next resizes is a round trip out
  // through Cloudflare and back, and ten of those start together and finish
  // together. The one in front of the customer waited behind nine nobody was
  // looking at, and `priority` could not help - the queue was the server's,
  // not the browser's.
  //
  // The moment it lands, the other nine mount and load quietly, so switching
  // photos still costs nothing. Only the first paint stops paying for them.
  const [heroLoaded, setHeroLoaded] = useState(false);

  // If it neither loads nor errors - a dropped connection, a tab left in the
  // background - the rest would never mount and the thumbnails would stop
  // working. After three seconds they come in anyway.
  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 3000);
    return () => clearTimeout(t);
  }, []);
  // Nayi photo chunte hi dobara optimiser ko mauka do.
  useEffect(() => { setHeroRaw(false); }, [activeImg]);
  const [added, setAdded] = useState(false);
  // Is this exact size/colour already in the cart? Drives Add to Cart → Go to Cart.
  const [inCart, setInCart] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  // Nothing to wait for when the server already sent the product. Read as a
  // boolean so the effect below can depend on it without taking the whole
  // object and re-running whenever its identity changes.
  const startedWithProduct = Boolean(initialProduct);
  const [loading, setLoading] = useState(!startedWithProduct);
  const [imgHovered, setImgHovered] = useState(false);
  // True only for a real mouse. Phones fire a synthetic mouseenter on tap but never
  // a mouseleave, which left the magnifier stuck over the page.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50, cx: 0, cy: 0 });

  // Which delivered orders of this customer actually contain this product.
  //
  // This used to be a plain yes/no. The server, quite rightly, will not take a
  // review that does not name the purchase it came from - so with only a yes,
  // every submission from this page was refused with "Please choose which order
  // this is about", and the form had no way of saying it. The orders are kept
  // now, and the one being reviewed is named.
  const [reviewableOrders, setReviewableOrders] = useState<string[]>([]);
  const [reviewOrderId, setReviewOrderId] = useState('');
  // What this customer has already written about this product, whatever its
  // state - the public list carries only approved ones.
  const [myReviews, setMyReviews] = useState<Array<{
    id: number; orderId: string | null; rating: number; text: string; status: string; imageUrls: string | null;
  }>>([]);
  const canReview = reviewableOrders.length > 0;
  // Review form
  const [rating, setRating] = useState(5);
  const [shareMsg, setShareMsg] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewMsg, setReviewMsg] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // The review already written for the order now selected, if there is one.
  // Everything below keys off this: the heading, the button, and whether the
  // form posts a new review or changes the one that is there.
  const existingReview = myReviews.find(r => (r.orderId ?? '') === reviewOrderId) ?? null;

  // Loading the existing words into the form, so an edit starts from what was
  // written rather than from an empty box. Runs when the chosen order changes.
  useEffect(() => {
    if (existingReview) {
      setRating(existingReview.rating);
      setReviewText(existingReview.text);
    } else {
      setRating(5);
      setReviewText('');
    }
    setReviewFiles([]);
    setReviewMsg('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReview?.id, reviewOrderId]);

  // Canonical + SEO metadata are now provided server-side by layout.tsx
  // (generateMetadata), so no client-side canonical injection is needed here.

  useEffect(() => {
    let cancelled = false;
    const requestedId = parseProductId(params.id);

    const loadProduct = async () => {
      // Only blank the page when there is nothing to show yet. Setting this
      // unconditionally would flash "Loading…" over a product that is already
      // on screen.
      if (!startedWithProduct) setLoading(true);
      try {
        let loaded: Product | null = null;

        try {
          loaded = (await productsApi.getById(requestedId)).product;
        } catch {
          const all = await productsApi.getAll({ pageSize: 500 });
          loaded = all.products.find((p: Product) => p.dbId === requestedId)
            ?? all.products[requestedId - 1]
            ?? null;
        }

        if (cancelled) return;

        if (!loaded) {
          setProduct(null);
          setReviews([]);
          return;
        }

        setProduct(loaded);
        setWishlisted(isInWishlist(loaded.dbId));
        addRecentlyViewed(loaded);   // browsing history → personalization
        let ex: ExtraJson = {};
        try { ex = JSON.parse((loaded as any).extraJson ?? '{}'); } catch { ex = {}; }
        setExtra(ex);
        const loadedPack = Boolean(loaded.packOf && loaded.packOf > 1);
        const loadedSizes = ex.sizes ?? (ex.variantMatrix ? [...new Set(Object.keys(ex.variantMatrix).map(k => k.split('|')[0]))] : []);
        const loadedColors = loadedPack ? [] : (ex.colors ?? (ex.variantMatrix ? [...new Set(Object.keys(ex.variantMatrix).map(k => k.split('|')[1]).filter(Boolean))] : []));
        setSize(loadedSizes[0] ?? '');
        const firstColor = loadedColors[0] ?? '';
        const firstCustom = (ex.customColors ?? []).find(c => c.name === firstColor);
        setColor(firstColor);
        setActiveImg(
          firstCustom?.photo
            ? (productImageSrc(firstCustom.photo) || firstCustom.photo)
            : productImageSrc(loaded.image)
        );

        reviewsApi.getByProduct(loaded.dbId)
          .then(r => !cancelled && setReviews(r.reviews ?? []))
          .catch(() => !cancelled && setReviews([]));

        // Check if customer has a delivered order containing this product
        const customer = getCustomer();
        const token = getToken();
        if (customer && token) {
          ordersApi.getAll({ customerId: String(customer.id ?? '') }, token)
            .then(r => {
              if (cancelled) return;
              const delivered = (r.orders ?? []).filter(o => o.status?.toLowerCase() === 'delivered');
              const withIt = delivered
                .filter(o => (o.cart ?? []).some((line: any) => String(line.id) === String(loaded.dbId)))
                .map(o => o.id)
                .filter(Boolean) as string[];
              setReviewableOrders(withIt);
              setReviewOrderId(prev => (prev && withIt.includes(prev) ? prev : withIt[0] ?? ''));
            })
            .catch(() => {});

          reviewsApi.mine(loaded.dbId, token)
            .then(r => !cancelled && setMyReviews(r.reviews ?? []))
            .catch(() => !cancelled && setMyReviews([]));
        }
      } catch {
        if (!cancelled) {
          setProduct(null);
          setReviews([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProduct();
    return () => { cancelled = true; };
  }, [params.id, startedWithProduct]);

  // GA4 / GTM ecommerce — fire view_item when a product detail page is viewed.
  useEffect(() => {
    if (!product) return;
    trackEvent('view_item', {
      currency: 'INR',
      value: finalUnitPrice(product),
      items: [{
        item_id: (product as any).sku || String(product.dbId),
        // Page khulte waqt size chuna nahi hota, isliye group ka id — Meta ise
        // catalogue ke item_group_id se milata hai.
        item_group_id: (product as any).sku || String(product.dbId),
        item_name: product.name,
        item_category: product.category ?? '',
        price: finalUnitPrice(product),
        quantity: 1,
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.dbId]);

  // Every hook must run on every render, so these two live ABOVE the loading /
  // not-found early returns below. Putting them further down made React see a
  // different number of hooks once the product arrived, and the build refused it.
  useEffect(() => {
    if (!product) return;
    const sync = () => setInCart(getCart().some(i =>
      i.dbId === product.dbId
      && (i.selectedSize ?? '') === (size ?? '')
      && (i.selectedColor ?? '') === (color ?? '')));
    sync();
    window.addEventListener('cart-updated', sync);
    return () => window.removeEventListener('cart-updated', sync);
  }, [product, size, color]);

  // has-cart-bar lifts the chat button; has-pdp-bar adds the page padding, and is
  // its own class so other pages' floating cart bar is unaffected.
  useEffect(() => {
    document.body.classList.add('has-cart-bar', 'has-pdp-bar');
    return () => { document.body.classList.remove('has-cart-bar', 'has-pdp-bar'); };
  }, []);

  if (loading) return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Loading…</div>
  );
  if (!product) return (
    <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
      <p style={{ color: '#aaa' }}>Product not found.</p>
      <Link href="/products" className="button primary">Browse Products</Link>
    </div>
  );

  const price = finalUnitPrice(product);
  const saving = product.price > price ? Math.round(((product.price - price) / product.price) * 100) : 0;
  const fabric = detectFabric(product);

  // Product Details rows. What the merchant typed in admin wins; where they left
  // a field blank we fall back to something the product already knows, and a row
  // with nothing behind it is never rendered — no empty labels on the page.
  const specs = extra.specs ?? {};
  const colourNames = [
    ...(extra.colors ?? []),
    ...((extra.customColors ?? []).map(c => c.name ?? '')),
  ].filter(Boolean);
  const detailRows: Array<[string, string]> = ([
    ['Colour',       specs.color       || colourNames.join(', ')],
    ['Fabric',       specs.fabric      || fabric],
    ['Pattern',      specs.pattern     || ''],
    ['Type',         specs.type        || (product.subcategory ?? '')],
    ['Suitable For', specs.suitableFor || ''],
    ['Design',       specs.design      || ''],
    ['Ideal For',    specs.idealFor    || ''],
    ['Occasion',     specs.occasion    || ''],
    ['Size',         specs.size        || (extra.sizes ?? []).join(', ')],
  ] as Array<[string, string]>)
    .filter(([, v]) => v.trim().length > 0)
    // And never the same answer under two labels. Several of these rows fall back
    // to the subcategory, so without this a nighty could read Fabric: Nighty,
    // Type: Nighty, Ideal For: Nighty and look like a form filled in by a machine.
    .filter(([, v], i, all) => all.findIndex(([, w]) => w.trim().toLowerCase() === v.trim().toLowerCase()) === i);
  const isPackProduct = Boolean(product.packOf && product.packOf > 1);

  const gallery: string[] = [];
  const seenGallery = new Set<string>();
  // Dedupe by file name so the same photo referenced via different paths/objects
  // (e.g. main gallery + a pack column) only appears once.
  const galleryKey = (s: string) => s.split('/').pop()!.split('?')[0].toLowerCase();
  const addGalleryImage = (src?: unknown) => {
    if (typeof src === 'string') {
      const image = productImageSrc(src);
      if (!image) return;
      const key = galleryKey(image);
      if (seenGallery.has(key)) return;
      seenGallery.add(key);
      gallery.push(image);
    }
  };
  // ── Rang ki apni gallery ──
  //
  // Admin me har rang ke apne FRONT / SIDE / BACK / ZOOMED khaane pehle se
  // hain, aur wahan likha bhi hai: "customer jab ye design chunega to uske ye
  // photos dikhenge". Storefront unme se aaj tak sirf `photo` padhta tha, to
  // swatch dabane par ek tasveer badalti thi, poori patti nahi.
  //
  // Shart jaanbujh kar "kam se kam do photo" rakhi hai. 193 me se 102 products
  // me rang hain, par sirf EK me side/back bhara hai - kyunki bharne ka aaj
  // tak koi asar hi nahi dikhta tha. Jis rang ke paas sirf apni ek `photo` hai,
  // uske liye kuch nahi badalta: main gallery hi dikhti rahegi, bilkul aaj
  // jaisi. Jis din shop us rang ka side aur back bharegi, usi din uski apni
  // patti apne aap chalu ho jayegi. Na migration, na kisi purane product ka
  // kuch kam.
  const colourGallery: string[] = isPackProduct ? [] : (() => {
    const picked = (extra.customColors ?? []).find(cc => (cc.name ?? '') === color);
    const own = colourPhotos(picked);
    return own.length >= 2 ? own : [];
  })();

  const hasProductPhotos = Object.values(extra.productPhotos ?? {}).some(v => v);
  if (colourGallery.length > 0) {
    // Sirf is rang ki photos - shop ne yahi chuna tha.
    colourGallery.forEach(addGalleryImage);
  } else if (hasProductPhotos) {
    // productPhotos.front IS the main image — don't also add product.image
    // separately, that can show the main photo twice when file names differ.
    // The four named views, then anything past them, in the order it was
    // added. Numbered rather than named because a fabric close-up and a label
    // shot have no name worth giving, and the shop should not have to invent
    // one.
    allSlotPhotos(extra.productPhotos).forEach(addGalleryImage);
  } else {
    addGalleryImage(product.image);
    (extra.images ?? []).forEach(addGalleryImage);
  }
  // For a pack, show every photo the merchant filled for each item (column) -
  // the four named views and the numbered ones after them, read by the same
  // helper the main photos use. Duplicates are removed by file name above.
  if (isPackProduct) {
    (extra.packImages ?? extra.packColumnPhotos ?? extra.variantColumns ?? []).forEach(item => {
      if (typeof item === 'string') addGalleryImage(item);
      else allSlotPhotos(item).forEach(addGalleryImage);
    });
  }

  // Baaki rangon ki swatch-photo bhi gallery me chahiye. Swatch dabane par
  // activeImg wahi photo ban jati hai - agar wo gallery me na ho to neeche
  // wala shownImg use gallery[0] par laut dega aur galat tasveer dikhegi.
  //
  // Lekin jab oopar wali colourGallery chalu ho, tab nahi: us haalat me shop
  // ne "sirf us rang ki photos" chuna hai, aur yahan baaki rangon ki tasveer
  // jod dena usi ko tod dega. Tab clicked rang ki photo waise bhi gallery[0]
  // hi hai, to kuch jodne ki zarurat nahi. Naam se dedupe upar ho chuka hai.
  if (!isPackProduct && colourGallery.length === 0) {
    (extra.customColors ?? []).forEach(c => addGalleryImage(c.photo));
  }

  // Jo photo badi jagah par dikhegi. activeImg par seedha bharosa nahi kiya
  // ja sakta.
  //
  // activeImg hamesha product.image se shuru hota hai. Lekin jis product me
  // productPhotos bhare hain, uski gallery sirf un slots se banti hai aur
  // product.image usme jodi hi nahi jati (oopar wali tippani maanti hai ki
  // "front hi main image hai"). Product 177 par ye galat nikla: main image
  // product-img-...881.webp thi, aur gallery auto-img-9 se 16 tak. Matlab
  // gallery ki kisi bhi photo ka `img === activeImg` sach nahi hua, isliye
  // aathon <Image> opacity 0 par baithi rahin aur screen par sirf blurfill
  // bacha - 64px ka dhundhla thumbnail, hamesha ke liye. Ye dheemi photo nahi
  // thi, ye kabhi na aane wali photo thi; isiliye cache garam karne ke saat
  // deploy se kuch nahi badla.
  //
  // Rang ke swatch par bhi yahi hota tha: bina custom photo wale rang par
  // setActiveImg(product.image) chalta hai.
  //
  // Isliye dikhane ke liye activeImg nahi, ye lete hain - jo hamesha gallery
  // ke andar ki hi photo hoti hai. Gallery me product.image jodte nahi, warna
  // ek hi tasveer do baar dikh sakti hai jab uske do naam hon.
  const shownImg: string = (() => {
    if (gallery.length === 0) return activeImg;
    if (!activeImg) return gallery[0];
    const k = galleryKey(activeImg);
    return gallery.find(g => galleryKey(g) === k) ?? gallery[0];
  })();

  const sizes: string[] = [...new Set(extra.sizes ?? (extra.variantMatrix ? [...new Set(Object.keys(extra.variantMatrix).map(k => k.split('|')[0]))] : []))];
  const normalColors = extra.colors ?? (extra.variantMatrix ? [...new Set(Object.keys(extra.variantMatrix).map(k => k.split('|')[1]).filter(Boolean))] : []);
  const colors: string[] = isPackProduct ? [] : [...new Set([...normalColors, ...((extra.customColors ?? []).map(c => c.name ?? '').filter(Boolean))])];
  const colorCodes: Record<string, string> = {
    ...(extra.colorCodes ?? {}),
    ...Object.fromEntries((extra.customColors ?? []).filter(c => c.name && c.code).map(c => [c.name!, c.code!])),
  };
  // One swatch per colour (preset = circle, custom = photo) so ALL custom
  // colours show, even if they share a name, and without a text label.
  const customNames = new Set((extra.customColors ?? []).map(c => c.name));
  const swatchList: { key: string; name: string; photo?: string; code: string }[] = isPackProduct ? [] : [
    // Print colour ("Navy/White/Red") ka circle hisson me banta hai, ek flat
    // rang me nahi — customer ko dikhna chahiye ki kapda multi-colour hai.
    ...normalColors.filter((n: string) => !customNames.has(n)).map((name: string, i: number) => ({
      key: 'p' + i, name,
      code: swatchBackground(name, extra.colorShades?.[name]) || colorCodes[name] || '#ddd',
    })),
    ...((extra.customColors ?? []).map((cc, i) => ({
      key: 'c' + i, name: cc.name ?? '', photo: cc.photo,
      code: swatchBackground(cc.name, extra.colorShades?.[cc.name ?? '']) || cc.code || '#ddd',
    }))),
  ];

  const variantKey = colors.length > 0 ? `${size}|${color}` : size;
  // A stock table of all zeros on a product that is not marked sold out is an
  // empty table, not "nothing left" — see lib/variantStock.
  const variantStock = variantStockFor(extra.variantMatrix, variantKey, product.stock);
  const outOfStock = product.stock === 'Out of Stock' || (variantStock !== null && variantStock === 0);

  // How many are actually left, when that is known and small.
  //
  // The shop has the number and never showed it, so every product read the
  // same whether there were two left or two hundred — and "I'll order it next
  // week" is what a shopper decides when nothing says otherwise.
  //
  // Only below six, only above zero, and only from the real count: a shop that
  // says "only 3 left" on everything is making a claim its own stock page can
  // disprove, and that costs more trust than the hurry is worth.
  const lowStockLeft = (() => {
    if (outOfStock) return null;
    const n = variantStock !== null ? variantStock : (typeof product.qty === 'number' ? product.qty : null);
    return n !== null && n > 0 && n <= 5 ? n : null;
  })();

  // Never let the add-to-cart quantity exceed the available stock for this variant.
  const cappedQty = (variantStock !== null && variantStock > 0) ? Math.min(qty, variantStock) : qty;

  const handleAddToCart = () => {
    if (outOfStock) return;
    addToCart(product, cappedQty, size || undefined, color || undefined, variantStock ?? undefined);
    // The one step of the funnel nothing was recording. Both Google and Meta
    // bid on what happens after the click, and this is the first sign of it.
    trackEvent('add_to_cart', {
      currency: 'INR',
      value: finalUnitPrice(product) * cappedQty,
      items: [{
        item_id: (product as any).sku || String(product.dbId),
        item_group_id: (product as any).sku || String(product.dbId),
        // Yahan size aur rang dono maloom hain, to feed ki poori row ka id.
        item_variant_id: feedIdFor((product as any).sku, product.dbId, size || undefined, color || undefined),
        item_name: product.name,
        item_category: product.category ?? '',
        price: finalUnitPrice(product),
        quantity: cappedQty,
      }],
    });
    setAdded(true);
    window.dispatchEvent(new Event('cart-updated'));
    setTimeout(() => setAdded(false), 2000);
  };

  // Share this product: native share sheet on mobile, copy-link everywhere else.
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: product.name, url });
        return;
      } catch {
        return; // user dismissed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('Link copied!');
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(''), 2200);
  };

  const handleWishlist = () => {
    if (wishlisted) {
      removeFromWishlist(product.dbId);
      setWishlisted(false);
    } else {
      addToWishlist(product);
      setWishlisted(true);
    }
  };


  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const customer = getCustomer();
    if (!customer) { setReviewMsg('Please login to submit a review.'); return; }
    if (!reviewText.trim()) { setReviewMsg('Please write your review.'); return; }
    setSubmittingReview(true); setReviewMsg('');
    try {
      const token = getToken() ?? '';
      let images: string[] = [];
      if (reviewFiles.length > 0) {
        images = await Promise.all(reviewFiles.slice(0, 3).map(f => reviewsApi.uploadImage(f, token)));
      }

      if (existingReview) {
        // No new photos chosen means keep the ones that are there, rather than
        // silently stripping them off an edit that only fixed a typo.
        const keep = images.length > 0
          ? images
          : (() => { try { return JSON.parse(existingReview.imageUrls ?? '[]') as string[]; } catch { return []; } })();
        await reviewsApi.update(existingReview.id, { rating, text: reviewText.trim(), images: keep }, token);
        setReviewMsg('✅ Your review has been updated. It will appear again after approval.');
      } else {
        if (!reviewOrderId) { setReviewMsg('❌ Could not tell which order this is about. Reload the page.'); return; }
        await reviewsApi.submit({ productId: product.dbId, rating, text: reviewText.trim(), orderId: reviewOrderId, images }, token);
        setReviewMsg('✅ Review submitted! It will appear after approval.');
      }

      setReviewFiles([]);
      const fresh = await reviewsApi.mine(product.dbId, token).catch(() => null);
      if (fresh) setMyReviews(fresh.reviews ?? []);
    } catch (e) { setReviewMsg('❌ ' + (e as Error).message); }
    finally { setSubmittingReview(false); }
  };

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  // NOTE: Product + BreadcrumbList JSON-LD is now emitted server-side from layout.tsx, so it
  // lands in the initial HTML (fully crawlable). Kept out of this client component to avoid
  // duplicate structured data.

  return (
    <>
      {/* Breadcrumb */}
      <nav style={{ background: '#f9f9f9', borderBottom: '1px solid #eee', padding: '.6rem 1.5rem', fontSize: '.83rem', color: '#888' }}>
        <Link href="/" style={{ color: '#722f37' }}>Home</Link> &rsaquo;{' '}
        <Link href="/products" style={{ color: '#722f37' }}>Products</Link> &rsaquo;{' '}
        {product.category && <><Link href={`/${product.category.toLowerCase().replace(/ /g, '-')}`} style={{ color: '#722f37' }}>{product.category}</Link> &rsaquo; </>}
        <span>{product.name}</span>
      </nav>

      <style>{`
        @media (max-width: 899px) {
          /* Two tracks on a phone as well: the thumbnail rail, then the photo.
             The buy box and the description span both, underneath.

             This rule has to live here rather than in globals.css. The element
             carries gridTemplateColumns inline, so the override needs
             !important - and globals.css is in the head while this block is in
             the body, so at equal weight the later one wins. Putting it in the
             stylesheet would simply not take. */
          .product-detail-grid {
            grid-template-columns: auto minmax(0, 1fr) !important;
            column-gap: .55rem !important;
          }
        }
        @media (max-width: 700px) {
          .product-reviews-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div className="product-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', alignItems: 'start' }}>

          {/* Image Gallery */}
          <div className="pdp-gallery-col">
            {/* Outer wrapper: position:relative, NO overflow:hidden — magnifier can spill out */}
            <div
              className="pdp-gallery-main"
              style={{ position: 'relative', aspectRatio: '3/4', marginBottom: '.75rem', cursor: imgHovered && shownImg ? 'crosshair' : 'default' }}
              onMouseEnter={() => { if (canHover) setImgHovered(true); }}
              onMouseLeave={() => setImgHovered(false)}
              onMouseMove={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                setZoomPos({
                  x: Math.round(((e.clientX - rect.left) / rect.width)  * 100),
                  y: Math.round(((e.clientY - rect.top)  / rect.height) * 100),
                  cx: e.clientX,
                  cy: e.clientY,
                });
              }}
            >
              {/* Inner: overflow:hidden clips the image only */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: '12px', overflow: 'hidden', background: '#f5f5f5' }}>
                {shownImg && (
                  /* Photos uploaded before the shop started reshaping them are
                     not all 3:4, and a wide one leaves grey bands here just as
                     it did on the cards. Same answer: a blurred copy of the
                     photo fills the gap, and the photo itself stays whole. */
                  <div className="product-card-blurfill" aria-hidden="true"
                    style={{ backgroundImage: `url("${productImageThumb(shownImg).replace(/"/g, '%22')}")` }} />
                )}
                {/* Every photo of this product is rendered here, once, and
                    switching between them only changes which one is opaque.
                    
                    It used to be one <Image> whose src changed on a click. That
                    reads as a lag: the browser had never asked for that photo at
                    this size - the thumbnail is a 64px copy, no use here - so it
                    went and fetched a fresh one, and the customer sat looking at
                    the old picture while it travelled. Amazon's does not do that,
                    which is the whole point of the video the shop sent.
                    
                    They all load while the page is settling, in the background,
                    and after that a tap costs nothing at all. Only the first is
                    marked priority: the rest should not compete with it. */}
                {!shownImg
                  ? <div className="product-card-placeholder" aria-hidden="true" />
                  : heroRaw
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={shownImg} alt={product.name}
                        style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }} />
                    : gallery
                        // Before the first one has landed, the only photos on
                        // the page are it and whatever the customer has
                        // already tapped - never the whole set.
                        .filter((img, i) => heroLoaded || i === 0 || img === shownImg)
                        .map(img => {
                        const i = gallery.indexOf(img);
                        return (
                        <Image key={img} src={img} alt={i === 0 ? product.name : ''}
                          width={900} height={1200}
                          priority={i === 0}
                          fetchPriority={i === 0 ? 'high' : 'low'}
                          // Straight from nginx, no optimiser in the way.
                          //
                          // These photos are already WebP, already about
                          // 900px across, and mostly under 150KB - measured,
                          // 529 of them. Sending one through /_next/image
                          // buys a slightly smaller file and costs a round
                          // trip out to Cloudflare for the original plus a
                          // re-encode, and for a photo uploaded after the
                          // last deploy nothing is warm, so the customer sits
                          // looking at the blurred stand-in while that
                          // happens. Serving the file itself is the faster
                          // answer: Cloudflare already caches .webp at the
                          // edge for a week.
                          //
                          // The 64px thumbnails keep the optimiser, where it
                          // earns its place - 150KB down to about one.
                          unoptimized
                          // Describes the box it actually fills now that the
                          // rail stands beside it. Unused while unoptimized
                          // is set, and correct if that is ever removed.
                          sizes="(max-width: 899px) calc(100vw - 105px), 390px"
                          onLoad={() => { if (i === 0) setHeroLoaded(true); }}
                          onError={() => { if (i === 0) { setHeroRaw(true); setHeroLoaded(true); } }}
                          aria-hidden={img !== shownImg}
                          style={{
                            position: 'absolute', inset: 0, zIndex: 1,
                            width: '100%', height: '100%', objectFit: 'contain',
                            opacity: img === shownImg ? 1 : 0,
                            transition: 'opacity .12s linear',
                            pointerEvents: 'none',
                          }} />
                        );
                      })}
                {product.bestSeller && <span className="badge badge-yellow" style={{ position: 'absolute', zIndex: 2, top: 12, left: 12 }}>Best Seller</span>}
                {saving > 0 && <span className="badge badge-red" style={{ position: 'absolute', zIndex: 2, top: product.bestSeller ? 44 : 12, left: 12 }}>{saving}% off</span>}
              </div>
              {/* Circular magnifier — position:fixed so no overflow can clip it */}
              {canHover && imgHovered && shownImg && (
                <div style={{
                  position: 'fixed',
                  left: zoomPos.cx,
                  top: zoomPos.cy,
                  transform: 'translate(-50%, -50%)',
                  width: '160px', height: '160px',
                  borderRadius: '50%',
                  border: '2.5px solid rgba(167,53,77,.6)',
                  boxShadow: '0 4px 20px rgba(0,0,0,.25)',
                  backgroundImage: `url(${shownImg})`,
                  backgroundSize: '350% 350%',
                  backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                  pointerEvents: 'none',
                  zIndex: 99999,
                }} />
              )}
            </div>
            {gallery.length > 1 && (
              <div className="pdp-thumbs" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                {gallery.map((img, i) => (
                  <button key={i}
                    onClick={() => setActiveImg(img)}
                    // Hover switches as well, on a machine with a mouse. There is
                    // nothing to wait for now, so making the customer click to
                    // see a photo they are already pointing at is just a tax.
                    onMouseEnter={() => { if (canHover) setActiveImg(img); }}
                    onFocus={() => setActiveImg(img)}
                    aria-label={`Show photo ${i + 1}`}
                    style={{
                    width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden',
                    border: shownImg === img ? '2px solid #722f37' : '2px solid #eee',
                    padding: 0, cursor: 'pointer', background: '#f5f5f5', flexShrink: 0,
                  }}>
                    <Image src={img} alt={`${product.name} \u2014 photo ${i + 1}`} width={64} height={64} sizes="64px"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}

            {/* Details sit under the photo, description last. */}
            {(detailRows.length > 0 || product.description) && (
              <div className="pdp-desc">
                <h2>Product Details</h2>
                {detailRows.length > 0 && (
                  <dl className="pdp-specs-list">
                    {detailRows.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {product.description && <p>{product.description}</p>}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="pdp-col">
            <div className="pdp-head">
              <div style={{ minWidth: 0 }}>
                <p className="pdp-eyebrow">{product.category}</p>
                <h1 className="pdp-title">{product.name}</h1>
                {/* Spelled out rather than abbreviated: "SKU" means nothing to
                    a shopper, and this is the number they will quote on
                    WhatsApp when they ask whether it is in stock. */}
                {product.sku && (
                  <p style={{ margin: '.3rem 0 0', fontSize: '.78rem', color: '#8a817b' }}>
                    Product code: <strong style={{ color: '#5c534d', letterSpacing: '.02em' }}>{product.sku}</strong>
                  </p>
                )}
              </div>
              <div className="pdp-head-acts">
                <button type="button" className={`pdp-ico${wishlisted ? ' on' : ''}`} onClick={handleWishlist}
                  aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  title={wishlisted ? 'Saved to wishlist' : 'Add to wishlist'}>
                  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                    <path fill={wishlisted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                      d="M12 20.3S4.4 15.6 4.4 10.6a4.1 4.1 0 0 1 7.6-2.5 4.1 4.1 0 0 1 7.6 2.5c0 5-7.6 9.7-7.6 9.7Z" />
                  </svg>
                </button>
                <button type="button" className="pdp-ico" onClick={handleShare}
                  aria-label="Share this product" title="Share this product">
                  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                    <circle cx="18" cy="5.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="18" cy="18.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M8.4 10.8 15.6 6.9M8.4 13.2l7.2 3.9" />
                  </svg>
                </button>
                {shareMsg && <span className="pdp-share-msg">{shareMsg}</span>}
              </div>
            </div>

            {avgRating && (
              <div className="pdp-rating">
                <Stars n={Math.round(Number(avgRating))} />
                <b>{avgRating}</b>
                <span>({reviews.length} Rating{reviews.length !== 1 ? 's' : ''})</span>
              </div>
            )}

            {/* Price */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', flexWrap: 'wrap' }}>
                <span className="price" style={{ fontSize: '2rem' }}>₹{price.toLocaleString('en-IN')}</span>
                {saving > 0 && (
                  <>
                    <span className="price-orig" style={{ fontSize: '1.1rem' }}>₹{product.price.toLocaleString('en-IN')}</span>
                    <span className="pdp-off">{saving}% OFF</span>
                  </>
                )}
              </div>
              <p className="pdp-tax">Inclusive of all taxes</p>
            </div>

            {/* Colour / Design — every colour is its own swatch, no name label */}
            {swatchList.length > 0 && (
              <div>
                <p style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.5rem' }}>Colour / Design</p>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {swatchList.map(s => (
                    <button key={s.key} onClick={() => { setColor(s.name); setActiveImg(s.photo ? (productImageSrc(s.photo) || s.photo) : productImageSrc(product.image)); }}
                      title={s.name}
                      style={{
                        padding: 0, overflow: 'hidden',
                        borderRadius: s.photo ? '8px' : '50%',
                        border: color === s.name ? '2.5px solid #722f37' : '1.5px solid #ddd',
                        background: '#fff', cursor: 'pointer', flexShrink: 0,
                        width: s.photo ? '44px' : '36px',
                        height: s.photo ? '44px' : '36px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      {s.photo
                        ? <Image src={productImageSrc(s.photo) || s.photo} alt={s.name} width={48} height={48} sizes="48px"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ width: 16, height: 16, borderRadius: '50%', background: s.code, border: '1px solid #bbb', display: 'inline-block' }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sizes */}
            {sizes.length > 0 && (
              <div>
                <div className="pdp-label-row">
                  <p className="pdp-label">Select Size</p>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {sizes.map(s => {
                    const vKey = colors.length > 0 ? `${s}|${color}` : s;
                    const stock = variantStockFor(extra.variantMatrix, vKey, product.stock);
                    const oos = stock !== null && stock === 0;
                    return (
                      <button key={s} onClick={() => !oos && setSize(s)} disabled={oos} style={{
                        minWidth: '44px', height: '40px', padding: '0 .75rem', borderRadius: '6px',
                        border: size === s ? '2px solid #722f37' : '1.5px solid #ddd',
                        background: oos ? '#f5f5f5' : size === s ? '#722f37' : '#fff',
                        color: oos ? '#ccc' : size === s ? '#fff' : '#333',
                        fontSize: '.85rem', fontWeight: 600,
                        cursor: oos ? 'not-allowed' : 'pointer',
                        textDecoration: oos ? 'line-through' : 'none',
                      }}>{s}</button>
                    );
                  })}
                </div>
                {variantStock !== null && (
                  <p style={{ fontSize: '.8rem', marginTop: '.4rem', fontWeight: 600,
                    color: outOfStock ? '#e74c3c' : (lowStockLeft !== null ? '#c0392b' : '#27ae60') }}>
                    {outOfStock
                      ? 'Out of stock for this selection'
                      : lowStockLeft !== null
                        ? `Only ${lowStockLeft} left`
                        : `${variantStock} in stock`}
                  </p>
                )}
              </div>
            )}

            {variantStock === null && lowStockLeft !== null && (
              <p style={{ fontSize: '.85rem', fontWeight: 700, color: '#c0392b', margin: '.2rem 0 .6rem' }}>
                Only {lowStockLeft} left
              </p>
            )}

            {/* The only place to add or buy. It is fixed to the bottom of the
                screen, so there is nothing to scroll back up for, and the page
                carries no second copy of these buttons. Quantity is chosen in the
                cart / at checkout instead — one decision per screen. */}
            <div className="pdp-buybar">
              <div className="pdp-buybar-inner">
                <button
                  type="button"
                  className="pdp-buybar-btn pdp-buybar-cart"
                  disabled={outOfStock}
                  onClick={() => {
                    if (outOfStock) return;
                    if (inCart && !added) { router.push('/cart'); return; }
                    handleAddToCart();
                  }}>
                  {outOfStock ? 'OUT OF STOCK' : added ? '✓ ADDED' : inCart ? 'GO TO CART' : 'ADD TO CART'}
                </button>
                <button
                  type="button"
                  className="pdp-buybar-btn pdp-buybar-buy"
                  disabled={outOfStock}
                  onClick={() => { if (!outOfStock) { handleAddToCart(); router.push('/checkout'); } }}>
                  BUY NOW
                </button>
              </div>
            </div>

            {/* Free delivery / returns / COD */}
            <div className="pdp-trust">
              <div>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M2.5 6.5h10v9h-10zM12.5 9.5h4l3 3v3h-7z" />
                  <circle cx="6.2" cy="17.8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="16.6" cy="17.8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                <span>Free Delivery</span>
              </div>
              <div>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5v-9ZM3.7 7.6 12 12l8.3-4.4M12 12v9" />
                </svg>
                <span>Easy Returns</span>
              </div>
              <div>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <rect x="2.5" y="6" width="19" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M5.8 12h.01M18.2 12h.01" />
                </svg>
                <span>Cash on Delivery</span>
              </div>
            </div>
            <DeliveryEstimate />
          </div>
        </div>

        {/* Reviews Section */}
        <div style={{ marginTop: '3rem', borderTop: '2px solid #eee', paddingTop: '2rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' }}>
            Customer Reviews {avgRating && <span style={{ fontSize: '1rem', color: '#f59e0b', fontWeight: 800 }}>★ {avgRating}</span>}
            <span style={{ fontSize: '.85rem', color: '#aaa', fontWeight: 400, marginLeft: '.5rem' }}>({reviews.length})</span>
          </h2>

          <div className="product-reviews-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
            {/* Reviews List */}
            <div>
              {reviews.length === 0 ? (
                <p style={{ color: '#aaa', fontStyle: 'italic' }}>No reviews yet. Be the first to review!</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {reviews.map(r => (
                    <div key={r.id} style={{ background: '#f9f9f9', borderRadius: '10px', padding: '1rem', border: '1px solid #eee' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '.9rem' }}>{r.customerName || 'Customer'}</span>
                          <div style={{ marginTop: '.15rem' }}><Stars n={r.rating} /></div>
                        </div>
                        {r.createdAt && (
                          <span style={{ fontSize: '.75rem', color: '#aaa' }}>
                            {formatDateIst(r.createdAt)}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '.88rem', color: '#555', lineHeight: 1.6, margin: 0 }}>{r.text}</p>
                      {(() => {
                        let imgs: string[] = [];
                        try { const parsed = JSON.parse((r as any).imageUrls || '[]'); if (Array.isArray(parsed)) imgs = parsed; } catch {}
                        return imgs.length > 0 ? (
                          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
                            {imgs.map((u, i) => (
                              <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                                <img src={u} alt="Customer review photo" width={64} height={64}
                                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                              </a>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Write a Review — only after order delivered */}
            {canReview ? (
              <div style={{ background: '#f7eff0', borderRadius: '12px', padding: '1.25rem', border: '1.5px solid #f5c6cb' }}>
                <h3 style={{ fontWeight: 700, marginBottom: '.35rem', fontSize: '1rem', color: '#722f37' }}>
                  {existingReview ? 'Edit your review' : 'Write a Review'}
                </h3>
                {existingReview && (
                  <p style={{ fontSize: '.8rem', color: '#6b615c', margin: '0 0 .9rem', lineHeight: 1.55 }}>
                    You have already reviewed this from order {reviewOrderId}
                    {existingReview.status !== 'approved' && ' (waiting for approval)'}. Change it below -
                    it will go back for approval once you save.
                  </p>
                )}
                <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                  {/* Only shown when this product was bought more than once: each
                      purchase gets its own review, so the form has to know which. */}
                  {reviewableOrders.length > 1 && (
                    <div>
                      <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>Which order</label>
                      <select value={reviewOrderId} onChange={e => setReviewOrderId(e.target.value)}
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.55rem .75rem', fontSize: '.86rem', background: '#fff' }}>
                        {reviewableOrders.map(id => (
                          <option key={id} value={id}>
                            {id}{myReviews.some(r => (r.orderId ?? '') === id) ? ' — already reviewed' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>Your Rating</label>
                    <Stars n={rating} onClick={setRating} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>Your Review</label>
                    <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} rows={4}
                      placeholder="Share your experience..."
                      style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>
                      Add Photos <span style={{ color: '#888', fontWeight: 400 }}>
                        (optional, up to 3{existingReview ? ' — choosing new ones replaces the old' : ''})
                      </span>
                    </label>
                    <input type="file" accept="image/*" multiple
                      onChange={e => setReviewFiles(Array.from(e.target.files ?? []).slice(0, 3))}
                      style={{ fontSize: '.82rem' }} />
                    {reviewFiles.length > 0 && (
                      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
                        {reviewFiles.map((f, i) => (
                          <img key={i} src={URL.createObjectURL(f)} alt="" width={52} height={52}
                            style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                        ))}
                      </div>
                    )}
                  </div>
                  {reviewMsg && <p style={{ fontSize: '.85rem', color: reviewMsg.startsWith('✅') ? '#27ae60' : '#c0392b', fontWeight: 600 }}>{reviewMsg}</p>}
                  <button type="submit" disabled={submittingReview} className="button primary" style={{ alignSelf: 'flex-start' }}>
                    {submittingReview
                      ? (existingReview ? 'Saving…' : 'Submitting…')
                      : (existingReview ? 'Update my review' : 'Submit Review')}
                  </button>
                </form>
              </div>
            ) : (
              <div style={{ background: '#f9f9f9', borderRadius: '12px', padding: '1.25rem', border: '1.5px solid #eee', color: '#888', fontSize: '.88rem', textAlign: 'center' }}>
                🛍️ Purchase &amp; receive this product to write a review.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* You may also like — same-category cross-sell + internal linking */}
      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 1.5rem' }}>
        <BoughtTogether product={product} />
      </div>

      <RelatedProducts category={product.category} currentId={product.dbId} />

      {/* Personalization — the visitor's own browsing history (client-side only) */}
      <RecentlyViewed excludeId={product.dbId} />

    </>
  );
}
