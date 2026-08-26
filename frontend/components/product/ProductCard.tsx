'use client';
// Link import removed — Details now opens QuickView
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Product } from '@/types';
import { addToCart, finalUnitPrice } from '@/lib/cart';
import { addToWishlist, removeFromWishlist, isInWishlist } from '@/lib/wishlist';
import { productImageSrc } from '@/lib/productImages';
import QuickViewModal from '@/components/product/QuickViewModal';

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(isInWishlist(product.dbId));
  const [quickView, setQuickView] = useState(false);
  const [imgError, setImgError] = useState(false);

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
  const extra = (() => {
    try { return JSON.parse((product as any).extraJson ?? '{}'); } catch { return {}; }
  })() as { sizes?: string[]; colors?: string[]; customColors?: Array<{ name?: string }>; variantMatrix?: Record<string, number> };
  const needsSelection = Boolean((extra.sizes?.length ?? 0) || (extra.colors?.length ?? 0) || (extra.customColors?.length ?? 0) || extra.variantMatrix);

  // BUY NOW: add the item then jump straight to checkout. If the product needs a size/colour
  // choice, open Quick View first so the customer can pick before buying.
  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((product.stock ?? '').toLowerCase().includes('out of stock')) return;
    if (needsSelection) { setQuickView(true); return; }
    addToCart(product);
    window.dispatchEvent(new Event('cart-updated'));
    router.push('/checkout');
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

          {/* Top badges — Best Seller shows as a glowing watermark (no solid tag) */}
          <div className="product-card-top-left">
            {product.bestSeller && (
              <span style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,.96)', fontWeight: 800, fontSize: '.85rem', letterSpacing: '.04em', textShadow: '0 0 8px rgba(122,10,34,.95), 0 0 16px rgba(255,200,60,.7), 0 1px 3px rgba(0,0,0,.55)' }}>Best Seller</span>
            )}
            {!product.bestSeller && <span style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,.96)', fontWeight: 800, fontSize: '.85rem', letterSpacing: '.04em', textShadow: '0 0 8px rgba(122,10,34,.95), 0 0 16px rgba(255,200,60,.7), 0 1px 3px rgba(0,0,0,.55)' }}>New</span>}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
            <span className={`product-stock-badge ${product.stock === 'In Stock' ? 'in-stock' : product.stock === 'Limited Stock' ? 'limited-stock' : 'out-stock'}`}>
              {product.stock || 'In Stock'}
            </span>
            {(product.reviewCount ?? 0) === 0 && (
              <span style={{ display: 'inline-block', background: '#e8f5e9', color: '#2e7d32', fontSize: '.68rem', fontWeight: 700, padding: '.12rem .45rem', borderRadius: '10px', whiteSpace: 'nowrap', lineHeight: 1.4 }}>✨ New</span>
            )}
          </div>

          <span className="product-card-name" title={product.name} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: '#1a1a1a', fontSize: '.9rem', margin: '.25rem 0', lineHeight: 1.3 }}>
            {product.name}
          </span>

          {/* Rating — real reviews only ("New" tag now sits next to the stock badge) */}
          {(product.reviewCount ?? 0) > 0 && (
            <div className="product-rating">
              <span className="stars">★★★★★</span>
              <span className="rating-val">{product.avgRating} ({product.reviewCount})</span>
            </div>
          )}

          {/* Price + discount % right after the rate */}
          <div className="product-price-row">
            <span className="price">₹{price.toLocaleString('en-IN')}</span>
            {saving > 0 && <span className="price-orig">₹{product.price.toLocaleString('en-IN')}</span>}
            {saving > 0 && <span style={{ color: '#c62828', fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap' }}>{saving}% Off</span>}
          </div>

          {/* Single compact BUY NOW button, pinned to the bottom of the card */}
          <div style={{ marginTop: 'auto', paddingTop: '.6rem', textAlign: 'center' }}>
            <button onClick={handleBuyNow} className="btn-add-cart" style={{ margin: 0, padding: '.42rem 1.4rem', fontSize: '.82rem', fontWeight: 800, letterSpacing: '.03em', width: 'auto', display: 'inline-block', background: 'linear-gradient(180deg,#a7354d 0%,#8e2a3f 100%)', color: '#fff', border: 'none', borderRadius: '8px', boxShadow: 'none' }}>
              BUY NOW
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
