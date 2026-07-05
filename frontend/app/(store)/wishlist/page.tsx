'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Product } from '@/types';
import { getWishlist, removeFromWishlist } from '@/lib/wishlist';
import { addToCart, finalUnitPrice } from '@/lib/cart';

export default function WishlistPage() {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    setItems(getWishlist());
  }, []);

  const handleRemove = (id: number) => {
    removeFromWishlist(id);
    setItems(getWishlist());
  };

  const handleAddToCart = (product: Product) => {
    addToCart(product);
    window.dispatchEvent(new Event('cart-updated'));
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Wishlist</h1>
        <p>Items you have saved for later. Add them to cart when you are ready.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section className="auth-stack">
          {items.length === 0 ? (
            <div className="form-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤍</div>
              <h2 style={{ marginBottom: '.5rem' }}>Your wishlist is empty</h2>
              <p style={{ color: '#777', marginBottom: '1.5rem' }}>Browse products and save your favourites here.</p>
              <Link href="/products" className="button primary">Browse Products</Link>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: '1rem', color: '#666' }}>{items.length} item{items.length > 1 ? 's' : ''} saved</p>
              <div className="products-grid">
                {items.map(product => {
                  const price = finalUnitPrice(product);
                  const saving = product.price > price ? Math.round(((product.price - price) / product.price) * 100) : 0;
                  return (
                    <div key={product.dbId} className="product-card" style={{ display: 'block' }}>
                      <div style={{ position: 'relative', overflow: 'hidden', aspectRatio: '3/4', background: '#f5f5f5' }}>
                        {product.image ? (
                          <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', color: '#ddd' }}>👗</div>
                        )}
                        {saving > 0 && <span className="badge badge-red" style={{ position: 'absolute', top: 8, left: 8 }}>{saving}% off</span>}
                        <button
                          onClick={() => handleRemove(product.dbId)}
                          style={{ position: 'absolute', top: 8, right: 8, background: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}
                          title="Remove from wishlist"
                        >✕</button>
                      </div>
                      <div className="product-card-body">
                        <h3 style={{ margin: '0 0 .4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</h3>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.4rem', marginBottom: '.5rem' }}>
                          <span className="price">₹{price.toLocaleString('en-IN')}</span>
                          {saving > 0 && <span className="price-orig">₹{product.price.toLocaleString('en-IN')}</span>}
                        </div>
                        <button onClick={() => handleAddToCart(product)} className="button primary" style={{ width: '100%', padding: '.5rem', fontSize: '.82rem' }}>
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
