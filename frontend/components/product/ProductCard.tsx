'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Product } from '@/types';
import { finalUnitPrice } from '@/lib/cart';
import { addToWishlist, removeFromWishlist, isInWishlist } from '@/lib/wishlist';
import { productImageSrc } from '@/lib/productImages';
import { productSlug } from '@/lib/productSlug';

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(isInWishlist(product.dbId));
  const [imgError, setImgError] = useState(false);
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

  const openProduct = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <>
      <div className="product-card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }} onClick={openProduct}>
        {/* Image */}
        <div className="product-card-img">
          <div onClick={openProduct}>
            {image && !imgError ? (
              /^https?:/i.test(image) ? (
                <Image src={image} alt={product.name}
                  width={400}
                  height={400}
                  priority={priority}
                  sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 240px"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <img src={image} alt={product.name}
                  loading={priority ? 'eager' : 'lazy'}
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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

          <Link href={href} onClick={e => e.stopPropagation()}
            className="product-card-name" title={product.name}
            style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: '#1a1a1a', fontSize: '.9rem', margin: '.25rem 0', lineHeight: 1.3, textDecoration: 'none' }}>
            {product.name}
          </Link>

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
      </div>

    </>
  );
}
