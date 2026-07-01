'use client';
// Link import removed — Details now opens QuickView
import { useState } from 'react';
import Image from 'next/image';
import type { Product } from '@/types';
import { addToCart } from '@/lib/cart';
import { addToWishlist, removeFromWishlist, isInWishlist } from '@/lib/wishlist';
import { productImageSrc } from '@/lib/productImages';
import QuickViewModal from '@/components/product/QuickViewModal';

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const [added, setAdded] = useState(false);
  const [wishlisted, setWishlisted] = useState(isInWishlist(product.dbId));
  const [quickView, setQuickView] = useState(false);
  const [imgError, setImgError] = useState(false);

  const price = product.discountPrice ?? product.price;
  const saving = product.price > price ? Math.round(((product.price - price) / product.price) * 100) : 0;
  const image = productImageSrc(product.image);
  const extra = (() => {
    try { return JSON.parse((product as any).extraJson ?? '{}'); } catch { return {}; }
  })() as { sizes?: string[]; colors?: string[]; customColors?: Array<{ name?: string }>; variantMatrix?: Record<string, number> };
  const needsSelection = Boolean((extra.sizes?.length ?? 0) || (extra.colors?.length ?? 0) || (extra.customColors?.length ?? 0) || extra.variantMatrix);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (needsSelection) {
      setQuickView(true);
      return;
    }
    addToCart(product);
    setAdded(true);
    window.dispatchEvent(new Event('cart-updated'));
    setTimeout(() => setAdded(false), 1500);
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

  const openQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    setQuickView(true);
  };

  return (
    <>
      <div className="product-card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }} onClick={openQuickView}>
        {/* Image */}
        <div className="product-card-img">
          <div onClick={openQuickView}>
            {image && !imgError ? (
              /^https?:/i.test(image) ? (
                <Image src={image} alt={product.name}
                  width={400}
                  height={400}
                  priority={priority}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <img src={image} alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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

          {/* Top badges */}
          <div className="product-card-top-left">
            {product.bestSeller && <span className="product-badge-new">Best Seller</span>}
            {!product.bestSeller && <span className="product-badge-new">New</span>}
            {saving > 0 && <span className="product-badge-sale">{saving}% off</span>}
          </div>

          {/* Quick View hover label */}
          <div className="product-quick-view-hint">
            🔍 Quick View
          </div>

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

          <span className={`product-stock-badge ${product.stock === 'In Stock' ? 'in-stock' : product.stock === 'Limited Stock' ? 'limited-stock' : 'out-stock'}`}>
            {product.stock || 'In Stock'}
          </span>

          <span className="product-card-name" title={product.name} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 600, color: '#1a1a1a', fontSize: '.9rem', margin: '.25rem 0', lineHeight: 1.3 }}>
            {product.name}
          </span>

          {/* Rating — real reviews, or a "New" tag when there are none yet */}
          {(product.reviewCount ?? 0) > 0 ? (
            <div className="product-rating">
              <span className="stars">★★★★★</span>
              <span className="rating-val">{product.avgRating} ({product.reviewCount})</span>
            </div>
          ) : (
            <span style={{ display: 'inline-block', background: '#e8f5e9', color: '#2e7d32', fontSize: '.72rem', fontWeight: 700, padding: '.15rem .55rem', borderRadius: '12px' }}>✨ New</span>
          )}

          {/* Price */}
          <div className="product-price-row">
            <span className="price">₹{price.toLocaleString('en-IN')}</span>
            {saving > 0 && <span className="price-orig">₹{product.price.toLocaleString('en-IN')}</span>}
          </div>

          {/* Buttons — side by side, always pinned to the bottom of the card */}
          <div style={{ display: 'flex', gap: '.5rem', marginTop: 'auto', paddingTop: '.6rem' }}>
            <button onClick={handleAdd} className="btn-add-cart" style={{ flex: 1, margin: 0 }}>
              {added ? '✓ Added!' : 'Add to Cart'}
            </button>
            <button className="btn-details" onClick={openQuickView} style={{ flex: 1, margin: 0, cursor: 'pointer' }}>
              Details
            </button>
          </div>
        </div>
      </div>

      {/* Quick View Modal */}
      {quickView && (
        <QuickViewModal product={product} onClose={() => setQuickView(false)} />
      )}
    </>
  );
}
