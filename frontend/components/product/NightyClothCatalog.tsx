'use client';
import { useState, useMemo } from 'react';
import type { Product } from '@/types';
import { productImageSrc } from '@/lib/productImages';

const WA_NUMBER = '919429429880';

function waLink(product: Product) {
  const msg = encodeURIComponent(
    `Hello! I'm interested in ordering *${product.name}* (SKU: ${product.sku ?? product.dbId}) in bulk.\nPlease share availability and pricing.`
  );
  return `https://wa.me/${WA_NUMBER}?text=${msg}`;
}

export default function NightyClothCatalog({ products }: { products: Product[] }) {
  const [sort, setSort] = useState('position');
  const [subcatFilter, setSubcatFilter] = useState('');

  const subcategories = useMemo(() => {
    const subs = [...new Set(products.map(p => p.subcategory).filter(Boolean))];
    return subs as string[];
  }, [products]);

  const sorted = useMemo(() => {
    let arr = subcatFilter ? products.filter(p => p.subcategory === subcatFilter) : [...products];
    switch (sort) {
      case 'price-low':  arr = arr.sort((a, b) => (a.discountPrice ?? a.price) - (b.discountPrice ?? b.price)); break;
      case 'price-high': arr = arr.sort((a, b) => (b.discountPrice ?? b.price) - (a.discountPrice ?? a.price)); break;
      case 'newest':     arr = arr.sort((a, b) => b.dbId - a.dbId); break;
      default: break;
    }
    return arr;
  }, [products, sort, subcatFilter]);

  return (
    <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>

      {/* Catalog-only notice */}
      <div style={{
        background: 'linear-gradient(135deg, #fff8e1 0%, #fff3e0 100%)',
        border: '2px solid #ffb300',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
      }}>
        <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>📋</span>
        <div>
          <p style={{ fontWeight: 700, color: '#e65100', fontSize: '1rem', margin: '0 0 .3rem' }}>
            Catalog View — Online Ordering Not Available
          </p>
          <p style={{ color: '#795548', fontSize: '.88rem', margin: 0, lineHeight: 1.5 }}>
            Nighty Cloth is available for <strong>bulk orders only</strong>. Browse the catalog, then contact us on WhatsApp to discuss quantity, pricing and delivery.
            Monday–Saturday, 10 AM – 8 PM.
          </p>
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello! I would like to enquire about Nighty Cloth bulk orders.')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '.4rem',
              marginTop: '.75rem', background: '#25d366', color: '#fff',
              padding: '.45rem 1rem', borderRadius: '8px', fontWeight: 700,
              fontSize: '.85rem', textDecoration: 'none',
            }}
          >
            💬 Chat on WhatsApp
          </a>
        </div>
      </div>

      {products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#888' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧶</div>
          <p>No products found in this category yet.</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#333' }}>{sorted.length} products</span>
              {subcategories.length > 0 && (
                <select value={subcatFilter} onChange={e => setSubcatFilter(e.target.value)}
                  style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.35rem .75rem', fontSize: '.85rem' }}>
                  <option value="">All Subcategories</option>
                  {subcategories.map(s => <option key={s}>{s}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontSize: '.82rem', color: '#888' }}>Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.35rem .75rem', fontSize: '.85rem' }}>
                <option value="position">Default</option>
                <option value="price-low">Price: Low → High</option>
                <option value="price-high">Price: High → Low</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>

          {/* Product Grid — Catalog Cards */}
          <div className="products-grid">
            {sorted.map((p: any) => <NightyClothCard key={p.dbId} product={p} />)}
          </div>
        </>
      )}
    </main>
  );
}

function NightyClothCard({ product }: { product: Product }) {
  const image = productImageSrc(product.image);
  const price = product.discountPrice ?? product.price;
  const saving = product.price > price ? Math.round(((product.price - price) / product.price) * 100) : 0;

  return (
    <div className="product-card" style={{ cursor: 'default' }}>
      {/* Image */}
      <div className="product-card-img" style={{ pointerEvents: 'none' }}>
        {image ? (
          <img src={image} alt={product.name} />
        ) : (
          <div className="product-card-placeholder">🧶</div>
        )}
        {saving > 0 && (
          <div className="product-card-top-left">
            <span className="product-badge-sale">{saving}% off</span>
          </div>
        )}
        {/* Catalog-only badge */}
        <div style={{
          position: 'absolute', bottom: '8px', left: '8px',
          background: 'rgba(230,81,0,.85)', color: '#fff',
          fontSize: '.7rem', fontWeight: 700, padding: '.2rem .55rem',
          borderRadius: '20px', letterSpacing: '.03em',
        }}>
          BULK ONLY
        </div>
      </div>

      {/* Body */}
      <div className="product-card-body">
        {product.category && (
          <p className="product-card-cat">{product.category.toUpperCase()}</p>
        )}
        <h3 className="product-card-title">{product.name}</h3>
        <div className="product-card-price">
          <span className="product-price-current">₹{price.toLocaleString('en-IN')}</span>
          {saving > 0 && (
            <span className="product-price-original">₹{product.price.toLocaleString('en-IN')}</span>
          )}
        </div>
        {product.stockQty !== undefined && product.stockQty <= 0 && (
          <p style={{ color: '#e74c3c', fontSize: '.8rem', margin: '.25rem 0 0' }}>Out of stock</p>
        )}
      </div>

      {/* WhatsApp CTA instead of Add to Cart */}
      <div style={{ padding: '.75rem 1rem 1rem' }}>
        <a
          href={waLink(product)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
            width: '100%', background: '#25d366', color: '#fff',
            padding: '.55rem', borderRadius: '8px', fontWeight: 700,
            fontSize: '.85rem', textDecoration: 'none', border: 'none',
          }}
        >
          💬 Order via WhatsApp
        </a>
      </div>
    </div>
  );
}
