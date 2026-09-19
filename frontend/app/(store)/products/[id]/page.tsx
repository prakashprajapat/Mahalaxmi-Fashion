'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { productsApi, reviewsApi, ordersApi } from '@/lib/api';
import { addToCart, getCart } from '@/lib/cart';
import { finalUnitPrice } from '@/lib/price';
import { addToWishlist, isInWishlist, removeFromWishlist } from '@/lib/wishlist';
import { getCustomer, getToken } from '@/lib/auth';
import { productImageSrc } from '@/lib/productImages';
import { parseProductId } from '@/lib/productSlug';
import { presetColourCode } from '@/lib/presetColours';
import RelatedProducts from '@/components/product/RelatedProducts';
import RecentlyViewed from '@/components/product/RecentlyViewed';
import DeliveryEstimate from '@/components/product/DeliveryEstimate';
import SizeGuideButton from '@/components/product/SizeGuideButton';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { trackEvent } from '@/lib/analytics';
import type { Product, Review } from '@/types';

interface ExtraJson {
  sizes?: string[];
  colors?: string[];
  colorCodes?: Record<string, string>;
  variantMatrix?: Record<string, number>;
  images?: string[];
  productPhotos?: Record<string, string>;
  packImages?: Array<string | Record<string, string>>;
  packColumnPhotos?: Array<Record<string, string>>;
  variantColumns?: Array<Record<string, string>>;
  customColors?: Array<{ name?: string; code?: string; photo?: string; columnLetter?: string }>;
}

// Products have no dedicated fabric column yet, so read it out of the text the
// merchant already writes (name / subcategory / description). Falls back to the
// subcategory, and the Fabric cell is hidden when nothing is found.
const FABRIC_WORDS = ['Cotton', 'Rayon', 'Silk', 'Georgette', 'Chiffon', 'Satin', 'Linen',
  'Denim', 'Velvet', 'Crepe', 'Modal', 'Hosiery', 'Lycra', 'Viscose', 'Khadi', 'Chanderi',
  'Organza', 'Muslin', 'Poplin', 'Net'];
function detectFabric(p: Product): string {
  const hay = `${p.name} ${p.subcategory ?? ''} ${p.description ?? ''}`.toLowerCase();
  return FABRIC_WORDS.find(f => hay.includes(f.toLowerCase())) ?? (p.subcategory ?? '');
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

export default function ProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [extra, setExtra] = useState<ExtraJson>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [activeImg, setActiveImg] = useState('');
  const [added, setAdded] = useState(false);
  // Is this exact size/colour already in the cart? Drives Add to Cart → Go to Cart.
  const [inCart, setInCart] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imgHovered, setImgHovered] = useState(false);
  // True only for a real mouse. Phones fire a synthetic mouseenter on tap but never
  // a mouseleave, which left the magnifier stuck over the page.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50, cx: 0, cy: 0 });

  const [canReview, setCanReview] = useState(false);
  // Review form
  const [rating, setRating] = useState(5);
  const [shareMsg, setShareMsg] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewMsg, setReviewMsg] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Canonical + SEO metadata are now provided server-side by layout.tsx
  // (generateMetadata), so no client-side canonical injection is needed here.

  useEffect(() => {
    let cancelled = false;
    const requestedId = parseProductId(params.id);

    const loadProduct = async () => {
      setLoading(true);
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
              const bought = delivered.some(o => (o.cart ?? []).some((line: any) => String(line.id) === String(loaded.dbId)));
              setCanReview(bought);
            })
            .catch(() => {});
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
  }, [params.id]);

  // GA4 / GTM ecommerce — fire view_item when a product detail page is viewed.
  useEffect(() => {
    if (!product) return;
    trackEvent('view_item', {
      currency: 'INR',
      value: finalUnitPrice(product),
      items: [{
        item_id: (product as any).sku || String(product.dbId),
        item_name: product.name,
        item_category: product.category ?? '',
        price: finalUnitPrice(product),
        quantity: 1,
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.dbId]);

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
  const hasProductPhotos = Object.values(extra.productPhotos ?? {}).some(v => v);
  if (hasProductPhotos) {
    // productPhotos.front IS the main image — don't also add product.image
    // separately, that can show the main photo twice when file names differ.
    ['front', 'side', 'back', 'zoomed'].forEach(key => addGalleryImage(extra.productPhotos?.[key]));
  } else {
    addGalleryImage(product.image);
    (extra.images ?? []).forEach(addGalleryImage);
  }
  // For a pack, show every photo the merchant filled for each item (column):
  // front/side/back/zoomed. Duplicates are removed by file name above.
  if (isPackProduct) {
    (extra.packImages ?? extra.packColumnPhotos ?? extra.variantColumns ?? []).forEach(item => {
      if (typeof item === 'string') addGalleryImage(item);
      else ['front', 'side', 'back', 'zoomed'].forEach(key => addGalleryImage(item[key]));
    });
  }

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
    ...normalColors.filter((n: string) => !customNames.has(n)).map((name: string, i: number) => ({ key: 'p' + i, name, code: colorCodes[name] || presetColourCode(name) || '#ddd' })),
    ...((extra.customColors ?? []).map((cc, i) => ({ key: 'c' + i, name: cc.name ?? '', photo: cc.photo, code: cc.code || '#ddd' }))),
  ];

  const variantKey = colors.length > 0 ? `${size}|${color}` : size;
  const variantStock = extra.variantMatrix ? (extra.variantMatrix[variantKey] ?? null) : null;
  const outOfStock = product.stock === 'Out of Stock' || (variantStock !== null && variantStock === 0);

  // Never let the add-to-cart quantity exceed the available stock for this variant.
  const cappedQty = (variantStock !== null && variantStock > 0) ? Math.min(qty, variantStock) : qty;

  const handleAddToCart = () => {
    if (outOfStock) return;
    addToCart(product, cappedQty, size || undefined, color || undefined, variantStock ?? undefined);
    setAdded(true);
    window.dispatchEvent(new Event('cart-updated'));
    setTimeout(() => setAdded(false), 2000);
  };

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
      await reviewsApi.submit({ productId: product.dbId, rating, text: reviewText.trim(), images }, token);
      setReviewMsg('✅ Review submitted! It will appear after approval.');
      setReviewText(''); setRating(5); setReviewFiles([]);
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
        <Link href="/" style={{ color: '#a7354d' }}>Home</Link> &rsaquo;{' '}
        <Link href="/products" style={{ color: '#a7354d' }}>Products</Link> &rsaquo;{' '}
        {product.category && <><Link href={`/${product.category.toLowerCase().replace(/ /g, '-')}`} style={{ color: '#a7354d' }}>{product.category}</Link> &rsaquo; </>}
        <span>{product.name}</span>
      </nav>

      <style>{`
        @media (max-width: 899px) {
          .product-detail-grid { grid-template-columns: 1fr !important; }
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
              style={{ position: 'relative', aspectRatio: '3/4', marginBottom: '.75rem', cursor: imgHovered && activeImg ? 'crosshair' : 'default' }}
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
                {activeImg
                  ? <img src={activeImg} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem', color: '#ddd' }}>👗</div>}
                {product.bestSeller && <span className="badge badge-yellow" style={{ position: 'absolute', top: 12, left: 12 }}>Best Seller</span>}
                {saving > 0 && <span className="badge badge-red" style={{ position: 'absolute', top: product.bestSeller ? 44 : 12, left: 12 }}>{saving}% off</span>}
              </div>
              {/* Circular magnifier — position:fixed so no overflow can clip it */}
              {canHover && imgHovered && activeImg && (
                <div style={{
                  position: 'fixed',
                  left: zoomPos.cx,
                  top: zoomPos.cy,
                  transform: 'translate(-50%, -50%)',
                  width: '160px', height: '160px',
                  borderRadius: '50%',
                  border: '2.5px solid rgba(167,53,77,.6)',
                  boxShadow: '0 4px 20px rgba(0,0,0,.25)',
                  backgroundImage: `url(${activeImg})`,
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
                  <button key={i} onClick={() => setActiveImg(img)} style={{
                    width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden',
                    border: activeImg === img ? '2px solid #a7354d' : '2px solid #eee',
                    padding: 0, cursor: 'pointer', background: '#f5f5f5', flexShrink: 0,
                  }}>
                    <img src={img} alt={`View ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}

            {/* Description sits under the photo (like the reference layout) */}
            {product.description && (
              <div className="pdp-desc">
                <h2>Product Details</h2>
                <p>{product.description}</p>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="pdp-col">
            <div className="pdp-head">
              <div style={{ minWidth: 0 }}>
                <p className="pdp-eyebrow">{product.category}</p>
                <h1 className="pdp-title">{product.name}</h1>
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

            {/* Fabric + Availability */}
            <div className="pdp-specs">
              {fabric && (
                <div className="pdp-spec"><span>Fabric</span><b>{fabric}</b></div>
              )}
              <div className="pdp-spec">
                <span>Availability</span>
                <b className={outOfStock ? 'no' : 'ok'}>{outOfStock ? 'Out of Stock' : product.stock}</b>
              </div>
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
                        border: color === s.name ? '2.5px solid #a7354d' : '1.5px solid #ddd',
                        background: '#fff', cursor: 'pointer', flexShrink: 0,
                        width: s.photo ? '44px' : '36px',
                        height: s.photo ? '44px' : '36px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      {s.photo
                        ? <img src={productImageSrc(s.photo) || s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  <SizeGuideButton />
                </div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {sizes.map(s => {
                    const vKey = colors.length > 0 ? `${s}|${color}` : s;
                    const stock = extra.variantMatrix ? (extra.variantMatrix[vKey] ?? null) : null;
                    const oos = stock !== null && stock === 0;
                    return (
                      <button key={s} onClick={() => !oos && setSize(s)} disabled={oos} style={{
                        minWidth: '44px', height: '40px', padding: '0 .75rem', borderRadius: '6px',
                        border: size === s ? '2px solid #a7354d' : '1.5px solid #ddd',
                        background: oos ? '#f5f5f5' : size === s ? '#a7354d' : '#fff',
                        color: oos ? '#ccc' : size === s ? '#fff' : '#333',
                        fontSize: '.85rem', fontWeight: 600,
                        cursor: oos ? 'not-allowed' : 'pointer',
                        textDecoration: oos ? 'line-through' : 'none',
                      }}>{s}</button>
                    );
                  })}
                </div>
                {variantStock !== null && (
                  <p style={{ fontSize: '.8rem', marginTop: '.4rem', color: outOfStock ? '#e74c3c' : '#27ae60', fontWeight: 600 }}>
                    {outOfStock ? 'Out of stock for this selection' : `${variantStock} in stock`}
                  </p>
                )}
              </div>
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
                            {new Date(r.createdAt).toLocaleDateString('en-IN')}
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
              <div style={{ background: '#fdf0f3', borderRadius: '12px', padding: '1.25rem', border: '1.5px solid #f5c6cb' }}>
                <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '1rem', color: '#a7354d' }}>Write a Review</h3>
                <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
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
                    <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>Add Photos <span style={{ color: '#888', fontWeight: 400 }}>(optional, up to 3)</span></label>
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
                    {submittingReview ? 'Submitting…' : 'Submit Review'}
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
      <RelatedProducts category={product.category} currentId={product.dbId} />

      {/* Personalization — the visitor's own browsing history (client-side only) */}
      <RecentlyViewed excludeId={product.dbId} />

    </>
  );
}
