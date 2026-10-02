'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { Product } from '@/types';
import { finalUnitPrice } from '@/lib/cart';
import { addToWishlist, removeFromWishlist, isInWishlist } from '@/lib/wishlist';
import { productImageSrc, productImageThumb } from '@/lib/productImages';
import { productSlug } from '@/lib/productSlug';

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const [wishlisted, setWishlisted] = useState(isInWishlist(product.dbId));
  const [imgError, setImgError] = useState(false);
  // Next ka image optimiser kabhi-kabhi photo ko padh nahi pata (uska apna
  // public folder us photo tak nahi pahunchta — nayi upload ki hui photos par
  // /_next/image 400 deta hai, jabki photo khud theek kholti hai). Aise me
  // seedha asli file dikha dete hain: photo kam se kam dikhti to hai.
  const [rawFallback, setRawFallback] = useState(false);
  // A photo that is not roughly portrait leaves grey bands inside the 3:4 tile.
  // Rather than crop it — a two-model combo photo loses both models that way —
  // a blurred copy of the same photo fills the gap. Only the odd-shaped ones
  // pay for the blur, which is why this waits for the real dimensions.
  const [blurFill, setBlurFill] = useState(false);
  // Clicking a card goes straight to the full product page (no quick-view popup).
  const href = `/products/${productSlug(product.name, product.dbId)}`;

  // Keep the heart in sync: reflect saved state on load (SSR renders it false) and whenever
  // the wishlist changes anywhere on the page.
  useEffect(() => {
    const sync = () => setWishlisted(isInWishlist(product.dbId));
    sync();
    window.addEventListener('wishlist-updated', sync);
    return () => window.removeEventListener('wishlist-updated', sync);
  }, [product.dbId]);

  // Final price includes manual shipping (folded in silently). Discount % is measured MRP → final.
  const price = finalUnitPrice(product);
  const saving = product.price > price ? Math.round(((product.price - price) / product.price) * 100) : 0;
  const image = productImageSrc(product.image);
  // data:/blob: sources cannot go through the image optimiser; everything else can,
  // and until now nothing did — the branch below only accepted absolute URLs, while
  // every real product photo is stored as a relative /product-images/... path. So a
  // phone showing a 170px-wide card was downloading the full-size file, 89 times over.
  const inlineSrc = /^(data:|blob:)/i.test(image);

  const measure = (el: HTMLImageElement) => {
    if (!el.naturalWidth || !el.naturalHeight) return;
    // The tile is 3:4 (0.75). Anything appreciably wider than that is the case
    // worth filling behind; a slightly narrower photo already covers the tile.
    setBlurFill(el.naturalWidth / el.naturalHeight > 0.8);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (wishlisted) {
      removeFromWishlist(product.dbId);
      setWishlisted(false);
    } else {
      addToWishlist(product);
      setWishlisted(true);
    }
  };

  return (
    <>
      <Link href={href} className="product-card" aria-label={product.name}
        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%',
                 textDecoration: 'none', color: 'inherit' }}>
        {/* Image */}
        <div className="product-card-img">
          {blurFill && image && !imgError && (
            <div className="product-card-blurfill" aria-hidden="true"
              style={{ backgroundImage: `url("${productImageThumb(image).replace(/"/g, '%22')}")` }} />
          )}
          <div>
            {image && !imgError ? (
              !inlineSrc && !rawFallback ? (
                <Image src={image} alt={product.name}
                  width={600}
                  height={800}
                  priority={priority}
                  fetchPriority={priority ? 'high' : undefined}
                  sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 240px"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onLoad={e => measure(e.currentTarget)}
                  onError={() => setRawFallback(true)}
                />
              ) : (
                <img src={image} alt={product.name}
                  loading={priority ? 'eager' : 'lazy'}
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onLoad={e => measure(e.currentTarget)}
                  onError={() => setImgError(true)}
                />
              )
            ) : null}
            {/* Photo na ho to saada khaali jagah — koi emoji nahi. */}
            <div className="product-card-placeholder" aria-hidden="true"
              style={{ display: (!image || imgError) ? 'block' : 'none' }} />
          </div>

          {/* Only a real best seller gets a badge. Labelling every other card
              "New" made the word meaningless and cluttered the grid. */}
          {product.bestSeller && (
            <div className="product-card-top-left">
              {/* Pehle ye safed akshar the, bina kisi background ke, seedha
                  product ki photo par — padhne layak sirf is bharose par ki
                  peechhe ek chamak (text-shadow) daal di gayi thi. Halki
                  photo par wo chamak kaam nahi karti aur akshar gayab ho jate
                  hain; Lighthouse text-shadow ginta hi nahi, to contrast 1.11
                  nikalta tha jahan 4.5 chahiye.
                  Ab ye wahi .product-badge-* family hai jo New/Sale badge
                  use karte hain: thos (opaque) maroon, wahi radius, wahi
                  size — contrast 9.65, aur peechhe ki photo chaahe jaisi ho,
                  farq nahi padta. Alpha jaan-boojh kar nahi rakha: aadha
                  paardarshi background par Lighthouse contrast naap hi nahi
                  pata. */}
              <span className="product-badge-best">Best Seller</span>
            </div>
          )}

          {/* Wishlist */}
          <button className={`product-wishlist-btn ${wishlisted ? 'active' : ''}`} onClick={handleWishlist}
            aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'} title="Add to Wishlist">
            <span aria-hidden="true">{wishlisted ? '❤️' : '🤍'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="product-card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {(product.subcategory || product.category) && (
            <p className="product-card-cat">
              {(product.subcategory || product.category).toUpperCase()}
            </p>
          )}

          <span className="product-card-name" title={product.name}
            style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: '#1a1a1a', fontSize: '.9rem', margin: '.25rem 0', lineHeight: 1.3 }}>
            {product.name}
          </span>

          {/* Rating — real reviews only ("New" tag now sits next to the stock badge) */}
          {(product.reviewCount ?? 0) > 0 && (
            <div className="product-rating">
              <span className="stars">★★★★★</span>
              <span className="rating-val">{product.avgRating} ({product.reviewCount})</span>
            </div>
          )}

          {/* What they pay comes first; the MRP and the saving follow it. */}
          <div className="product-price-row">
            <span className="price">₹{price.toLocaleString('en-IN')}</span>
            {saving > 0 && <span className="price-orig">₹{product.price.toLocaleString('en-IN')}</span>}
            {saving > 0 && <span className="product-card-off">{saving}% off</span>}
          </div>
        </div>
      </Link>

    </>
  );
}
