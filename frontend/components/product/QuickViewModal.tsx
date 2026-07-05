'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Product } from '@/types';
import { addToCart, finalUnitPrice } from '@/lib/cart';
import { addToWishlist, removeFromWishlist, isInWishlist } from '@/lib/wishlist';
import { productImageSrc } from '@/lib/productImages';

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
  // Extended details (shown in expanded view)
  features?: string[];
  highlights?: string[];
  keyFeatures?: string[];
  specifications?: Record<string, unknown>;
  fabric?: string;
  material?: string;
  careInstructions?: string;
}

interface Props {
  product: Product;
  onClose: () => void;
}

export default function QuickViewModal({ product, onClose }: Props) {
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState('');
  const [colour, setColour] = useState('');
  const [added, setAdded] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [activeImg, setActiveImg] = useState('');
  const [imgHovered, setImgHovered] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50, cx: 0, cy: 0 }); // x/y=% for bg, cx/cy=fixed screen px
  const [expanded, setExpanded] = useState(false);

  // Parse extraJson
  const extra: ExtraJson = (() => {
    try { return JSON.parse((product as any).extraJson ?? '{}'); } catch { return {}; }
  })();

  const isPackProduct = Boolean(product.packOf && product.packOf > 1);
  const sizes = [...new Set(extra.sizes ?? [])];
  const colours = isPackProduct
    ? []
    : [...new Set([...(extra.colors ?? []), ...((extra.customColors ?? []).map(c => c.name ?? '').filter(Boolean))])];
  // One swatch per colour (preset = circle, custom = photo) so ALL custom
  // colours show — even if they share a name — and without a text label.
  const swatchList: { key: string; name: string; photo?: string; code: string }[] = isPackProduct ? [] : [
    // Preset colours: only show ones that actually have a colour code (skip the blank/grey dot).
    ...((extra.colors ?? [])
        .filter(name => name && name.trim() && extra.colorCodes?.[name])
        .map((name, i) => ({ key: 'p' + i, name, code: extra.colorCodes![name] }))),
    // Custom colours: show if they have a photo OR a real colour code.
    ...((extra.customColors ?? [])
        .filter(cc => cc.photo || cc.code)
        .map((cc, i) => ({ key: 'c' + i, name: cc.name ?? '', photo: cc.photo, code: cc.code || '#ddd' }))),
  ];
  const images: string[] = (() => {
    const imgs: string[] = [];
    const seen = new Set<string>();
    // Dedupe by file name (basename) so the same photo referenced via different
    // paths/objects (e.g. main gallery + a pack column) only appears once.
    const baseName = (s: string) => s.split('/').pop()!.split('?')[0].toLowerCase();
    const addImage = (img?: unknown) => {
      if (typeof img !== 'string') return;
      const src = productImageSrc(img);
      if (!src) return;
      const key = baseName(src);
      if (seen.has(key)) return;
      seen.add(key);
      imgs.push(src);
    };
    const hasProductPhotos = Object.values(extra.productPhotos ?? {}).some(v => v);
    if (hasProductPhotos) {
      // productPhotos.front IS the main image — don't also add product.image
      // separately, that can show the main photo twice when file names differ.
      ['front', 'side', 'back', 'zoomed'].forEach(key => addImage(extra.productPhotos?.[key]));
    } else {
      addImage(product.image);
      (extra.images ?? []).forEach(addImage);
    }
    // For a pack, also show each pack item's (column) photos.
    if (isPackProduct) {
      // Show every photo the merchant filled for each pack item (column):
      // front/side/back/zoomed. Duplicates are removed by file name above.
      const packPhotos = extra.packImages ?? extra.packColumnPhotos ?? extra.variantColumns ?? [];
      packPhotos.forEach(item => {
        if (typeof item === 'string') addImage(item);
        else ['front', 'side', 'back', 'zoomed'].forEach(key => addImage(item[key]));
      });
    }
    return imgs;
  })();

  useEffect(() => {
    setWishlisted(isInWishlist(product.dbId));
    setActiveImg(images[0] ?? '');
    setSize(sizes[0] ?? '');
    setColour(colours[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.dbId]);

  // Close on Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  const price = finalUnitPrice(product);
  const saving = product.price > price ? Math.round(((product.price - price) / product.price) * 100) : 0;
  const selectedVariantKey = colours.length > 0 ? `${size}|${colour}` : size;
  const selectedVariantStock = extra.variantMatrix ? (extra.variantMatrix[selectedVariantKey] ?? null) : null;
  const inStock = (product as any).stockQty !== 0
    && product.stock !== 'Out of Stock'
    && product.stock !== 'out_of_stock'
    && (selectedVariantStock === null || selectedVariantStock > 0);

  const handleAdd = () => {
    addToCart(product as any, qty, size || undefined, colour || undefined);
    window.dispatchEvent(new Event('cart-updated'));
    setAdded(true);
    setTimeout(() => { setAdded(false); onClose(); }, 800);
  };

  const handleWishlist = () => {
    if (wishlisted) { removeFromWishlist(product.dbId); setWishlisted(false); }
    else { addToWishlist(product); setWishlisted(true); }
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: expanded ? '12px' : '16px',
          width: '100%', maxWidth: expanded ? '98vw' : '860px',
          maxHeight: expanded ? '97vh' : '90vh',
          overflowX: 'hidden', overflowY: 'auto', position: 'relative',
          boxShadow: '0 24px 80px rgba(0,0,0,.3)',
          display: 'flex', flexDirection: 'column',
          transition: 'max-width .25s, max-height .25s',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '12px', right: '14px', zIndex: 10,
            background: 'rgba(0,0,0,.08)', border: 'none', borderRadius: '50%',
            width: '34px', height: '34px', fontSize: '1.1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Close"
        >✕</button>

        <div className="qv-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minWidth: 0, width: '100%' }}>

          {/* Left: Image gallery */}
          <div style={{ padding: '1.5rem', borderRight: '1px solid #f0f0f0', minWidth: 0 }}>
            {/* Main image — frame hugs the photo (no fixed square, no grey bars) */}
            <div style={{
              width: '100%', marginBottom: '.75rem',
              cursor: imgHovered && activeImg ? 'crosshair' : 'default',
              position: 'relative',
              borderRadius: '12px', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              onMouseEnter={() => setImgHovered(true)}
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
              {activeImg
                ? <img src={activeImg} alt={product.name} style={{ width: '100%', height: 'auto', maxHeight: '78vh', objectFit: 'contain', display: 'block' }} />
                : <div style={{ width: '100%', aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', color: '#ddd', background: '#f8f8f8' }}>👗</div>
              }
              {/* Circular magnifier — fixed so no parent overflow can clip it */}
              {imgHovered && activeImg && (
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

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="qv-thumbs" style={{ display: 'flex', gap: '.5rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '.35rem' }}>
                {images.map((img, i) => (
                  <button key={i} onClick={() => setActiveImg(img)}
                    style={{
                      width: '56px', height: '56px', borderRadius: '8px',
                      overflow: 'hidden', border: activeImg === img ? '2.5px solid #a7354d' : '2px solid #eee',
                      padding: 0, cursor: 'pointer', background: '#f8f8f8', flexShrink: 0,
                    }}>
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product info */}
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.75rem', minWidth: 0 }}>
            {/* SKU + Category */}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {product.category && (
                <span style={{ background: '#fdf0f3', color: '#a7354d', fontSize: '.72rem', fontWeight: 700, padding: '.2rem .55rem', borderRadius: '20px', textTransform: 'uppercase' }}>
                  {product.category}
                </span>
              )}
              {product.sku && (
                <span style={{ color: '#aaa', fontSize: '.75rem' }}>SKU: {product.sku}</span>
              )}
              {product.packOf && product.packOf > 1 && (
                <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '.72rem', fontWeight: 700, padding: '.2rem .55rem', borderRadius: '20px' }}>
                  Pack of {product.packOf}
                </span>
              )}
            </div>

            {/* Title */}
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1a1a1a', margin: 0, lineHeight: 1.35 }}>
              {product.name}
            </h2>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a7354d' }}>
                ₹{price.toLocaleString('en-IN')}
              </span>
              {saving > 0 && (
                <>
                  <span style={{ fontSize: '.95rem', color: '#aaa', textDecoration: 'line-through' }}>
                    ₹{product.price.toLocaleString('en-IN')}
                  </span>
                  <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '.8rem', fontWeight: 700, padding: '.2rem .55rem', borderRadius: '20px' }}>
                    {saving}% off
                  </span>
                </>
              )}
            </div>

            {/* Stock */}
            <p style={{ fontSize: '.85rem', fontWeight: 600, color: inStock ? '#2e7d32' : '#e74c3c', margin: 0 }}>
              {inStock ? '✓ In Stock' : '✗ Out of Stock'}
            </p>

            {/* Colour / design selector — every colour is its own swatch, no name label */}
            {swatchList.length > 0 && (
              <div>
                <p style={{ fontSize: '.85rem', fontWeight: 700, color: '#333', margin: '0 0 .4rem' }}>Colour / Design</p>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  {swatchList.map(s => (
                    <button key={s.key} onClick={() => { setColour(s.name); if (s.photo) setActiveImg(productImageSrc(s.photo) || s.photo); }}
                      title={s.name}
                      style={{
                        padding: 0, overflow: 'hidden',
                        borderRadius: s.photo ? '8px' : '50%',
                        border: colour === s.name ? '2.5px solid #a7354d' : '1.5px solid #ddd',
                        background: '#fff', cursor: 'pointer', flexShrink: 0,
                        width: s.photo ? '42px' : '34px',
                        height: s.photo ? '42px' : '34px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      {s.photo
                        ? <img src={productImageSrc(s.photo) || s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ width: 18, height: 18, borderRadius: '50%', background: s.code, border: '1px solid rgba(0,0,0,.15)', display: 'inline-block' }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size selector */}
            {sizes.length > 0 && (
              <div>
                <p style={{ fontSize: '.85rem', fontWeight: 700, color: '#333', margin: '0 0 .4rem' }}>Size</p>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  {sizes.map(s => {
                    const key = colours.length > 0 ? `${s}|${colour}` : s;
                    const variantQty = extra.variantMatrix ? (extra.variantMatrix[key] ?? null) : null;
                    const disabled = variantQty === 0;
                    return (
                      <button key={s} onClick={() => !disabled && setSize(s)} disabled={disabled}
                        style={{
                          padding: '.35rem .75rem', borderRadius: '6px', fontSize: '.85rem', fontWeight: 600,
                          border: size === s ? '2px solid #a7354d' : '1.5px solid #ddd',
                          background: disabled ? '#f5f5f5' : size === s ? '#fdf0f3' : '#fff',
                          color: disabled ? '#bbb' : size === s ? '#a7354d' : '#555',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          textDecoration: disabled ? 'line-through' : 'none',
                        }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <p style={{ fontSize: '.85rem', fontWeight: 700, color: '#333', margin: '0 0 .4rem' }}>Quantity</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))}
                  style={{ width: '34px', height: '34px', border: '1.5px solid #ddd', borderRadius: '8px', background: '#f8f8f8', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700 }}>
                  −
                </button>
                <span style={{ fontSize: '1rem', fontWeight: 700, minWidth: '24px', textAlign: 'center' }}>{qty}</span>
                <button onClick={() => setQty(q => q + 1)}
                  style={{ width: '34px', height: '34px', border: '1.5px solid #ddd', borderRadius: '8px', background: '#f8f8f8', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700 }}>
                  +
                </button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.25rem' }}>
              <button
                onClick={handleAdd}
                disabled={!inStock}
                style={{
                  flex: 1, padding: '.7rem 1rem', borderRadius: '10px', border: 'none',
                  background: inStock ? (added ? '#27ae60' : '#a7354d') : '#ccc',
                  color: '#fff', fontWeight: 700, fontSize: '.9rem', cursor: inStock ? 'pointer' : 'not-allowed',
                  transition: 'background .2s',
                }}
              >
                {added ? '✓ Added to Cart' : inStock ? '🛒 Add to Cart' : 'Out of Stock'}
              </button>
              <button
                onClick={handleWishlist}
                aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                title={wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                style={{
                  width: '44px', height: '44px', borderRadius: '10px',
                  border: '1.5px solid #ddd', background: '#fff',
                  fontSize: '1.2rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span aria-hidden="true">{wishlisted ? '❤️' : '🤍'}</span>
              </button>
            </div>

            {/* Description */}
            {product.description && (
              <p style={{ fontSize: '.85rem', color: '#555', lineHeight: 1.55, margin: 0 }}>
                {product.description}
              </p>
            )}

            {/* Expanded details section */}
            {expanded && (
              <div style={{ marginTop: '.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {/* Key features / highlights */}
                {(extra.features ?? extra.highlights ?? extra.keyFeatures) && (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#333', margin: '0 0 .35rem' }}>Key Features</p>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#555', fontSize: '.85rem', lineHeight: 1.6 }}>
                      {((extra.features ?? extra.highlights ?? extra.keyFeatures) as string[]).map((f: string, i: number) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Specifications table */}
                {extra.specifications && Object.keys(extra.specifications).length > 0 && (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#333', margin: '0 0 .35rem' }}>Specifications</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
                      <tbody>
                        {Object.entries(extra.specifications).map(([k, v]) => (
                          <tr key={k} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '.3rem .5rem', color: '#888', width: '40%', fontWeight: 600 }}>{k}</td>
                            <td style={{ padding: '.3rem .5rem', color: '#333' }}>{String(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Fabric / material */}
                {(extra.fabric ?? extra.material) && (
                  <p style={{ fontSize: '.85rem', color: '#555', margin: 0 }}>
                    <strong>Fabric/Material:</strong> {extra.fabric ?? extra.material}
                  </p>
                )}
                {/* Care instructions */}
                {extra.careInstructions && (
                  <p style={{ fontSize: '.85rem', color: '#555', margin: 0 }}>
                    <strong>Care:</strong> {extra.careInstructions}
                  </p>
                )}
                {/* Delivery info */}
                <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '.6rem .9rem', fontSize: '.83rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                  <span>🚚 <strong>Free delivery</strong> on orders above ₹499</span>
                  <span>🔄 <strong>Easy returns</strong> within 7 days</span>
                  <span>✅ <strong>Genuine product</strong> — 100% original</span>
                </div>
                {/* Link to full page */}
                <a href={`/products/${product.dbId}`} target="_blank" rel="noopener"
                  style={{ fontSize: '.82rem', color: '#a7354d', textDecoration: 'underline' }}>
                  Open full product page ↗
                </a>
              </div>
            )}

            {/* View full product details — expands the modal in-place */}
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                fontSize: '.82rem', color: '#a7354d', fontWeight: 600,
                marginTop: 'auto', textDecoration: 'underline',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
              }}
            >
              {expanded ? '← Collapse details' : 'View full product details →'}
            </button>
          </div>
        </div>

        {/* Mobile: stack on small screens */}
        <style>{`
          @media (max-width: 600px) {
            .qv-grid { grid-template-columns: 1fr !important; }
          }
          /* Thin horizontal scrollbar that sits just under the thumbnail strip */
          .qv-thumbs { scrollbar-width: thin; scrollbar-color: #a7354d #f0e6ea; }
          .qv-thumbs::-webkit-scrollbar { height: 6px; }
          .qv-thumbs::-webkit-scrollbar-track { background: #f0e6ea; border-radius: 3px; }
          .qv-thumbs::-webkit-scrollbar-thumb { background: #a7354d; border-radius: 3px; }
        `}</style>
      </div>
    </div>
  );
}
