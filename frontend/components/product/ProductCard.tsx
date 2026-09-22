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
              !inlineSrc ? (
                <Image src={image} alt={product.name}
                  width={600}
                  height={800}
                  priority={priority}
                  fetchPriority={priority ? 'high' : undefined}
                  sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 240px"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onLoad={e => measure(e.currentTarget)}
                  onError={() => setImgError(true)}
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
            <div className="product-card-placeholder" style={{ display: (!image || imgError) ? 'flex' : 'none' }}>
              {product.category?.toLowerCase().includes('saree') ? '🥻'
                : product.category?.toLowerCase().includes('nighty') ? '🌙'
                : product.category?.toLowerCase().includes('men') ? '👔'
                : '👗'}
            </div>
          </div>

          {/* Only a real best seller gets a badge. Labelling every other card
              "New" made the word meaningless and cluttered the grid. */}
          {product.bestSeller && (
            <div className="product-card-top-left">
              <span style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,.96)', fontWeight: 800, fontSize: '.85rem', letterSpacing: '.04em', textShadow: '0 0 8px rgba(122,10,34,.95), 0 0 16px rgba(255,200,60,.7), 0 1px 3px rgba(0,0,0,.55)' }}>Best Seller</span>
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
