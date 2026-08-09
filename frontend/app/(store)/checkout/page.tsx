'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCart, cartTotal, clearCart, cartShipping, finalUnitPrice, unitBase } from '@/lib/cart';
import PincodeChecker from '@/components/checkout/PincodeChecker';
import { getCustomer, getToken } from '@/lib/auth';
import { ordersApi, paymentsApi, cashfreeApi, couponsApi, settingsApi } from '@/lib/api';
import { trackEvent, toGa4Items, trackAdsConversion } from '@/lib/analytics';
import type { CartItem, Customer } from '@/types';

// Map cart items → GA4 ecommerce items.
const cartToItems = (lines: CartItem[]) =>
  toGa4Items(lines.map(i => ({
    dbId: i.dbId, sku: (i as any).sku, name: i.name,
    category: (i as any).category, quantity: i.quantity, price: finalUnitPrice(i),
  })));

function getPincodeState(pincode: string): string {
  if (pincode.length < 2) return '';
  const prefix = parseInt(pincode.substring(0, 2), 10);
  if (prefix === 11) return 'Delhi';
  if (prefix >= 12 && prefix <= 13) return 'Haryana';
  if (prefix >= 14 && prefix <= 16) return 'Punjab';
  if (prefix === 17) return 'Himachal Pradesh';
  if (prefix >= 18 && prefix <= 19) return 'Jammu & Kashmir';
  if (prefix >= 20 && prefix <= 28) return 'Uttar Pradesh';
  if (prefix >= 30 && prefix <= 34) return 'Rajasthan';
  if (prefix >= 36 && prefix <= 39) return 'Gujarat';
  if (prefix >= 40 && prefix <= 44) return 'Maharashtra';
  if (prefix >= 45 && prefix <= 49) return 'Madhya Pradesh';
  if (prefix >= 50 && prefix <= 53) return 'Telangana';
  if (prefix >= 56 && prefix <= 59) return 'Karnataka';
  if (prefix >= 60 && prefix <= 64) return 'Tamil Nadu';
  if (prefix >= 67 && prefix <= 69) return 'Kerala';
  if (prefix >= 70 && prefix <= 74) return 'West Bengal';
  if (prefix >= 75 && prefix <= 77) return 'Odisha';
  if (prefix === 78) return 'Assam';
  if (prefix === 79) return 'Arunachal Pradesh';
  if (prefix >= 80 && prefix <= 85) return 'Bihar';
  if (prefix >= 90 && prefix <= 97) return 'Jharkhand';
  return '';
}

type Step = 'shipping' | 'payment' | 'confirm';

// Flat handling fee added when the customer chooses Cash on Delivery.
const COD_FEE = 50;

// Robustly load an external SDK <script> and wait until its global is ready.
// (Fixes "window.Cashfree is not a function": React-rendered <script async> can execute
//  late or not at all; we load it on demand at payment time instead.)
function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { resolve(); return; }
    if (document.querySelector(`script[data-dyn="${src}"]`)) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src; el.async = true; el.dataset.dyn = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('sdk-load-failed'));
    document.head.appendChild(el);
  });
}
async function ensureCashfreeSdk(): Promise<void> {
  if (typeof (window as any).Cashfree === 'function') return;
  try { await loadScriptOnce('https://sdk.cashfree.com/js/v3/cashfree.js'); } catch {}
  for (let i = 0; i < 60 && typeof (window as any).Cashfree !== 'function'; i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof (window as any).Cashfree !== 'function') {
    throw new Error('Payment gateway could not load. Please check your internet connection and try again.');
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [step, setStep] = useState<Step>('shipping');
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [payMethod, setPayMethod] = useState<'online' | 'cod'>('online');

  const [shipping, setShipping] = useState({
    name: '', email: '', phone: '', address: '', city: '', pincode: '', state: '',
  });

  const [panData, setPanData] = useState({ panNumber: '', panName: '' });

  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number; message: string } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const applyCustomer = (cust: Customer) => {
    setCustomer(cust);
    setShipping(s => ({
      ...s,
      name: `${cust.firstName} ${cust.lastName}`.trim(),
      email: cust.email ?? '',
      phone: cust.phone,
      address: [cust.addrLine1, cust.addrLine2].filter(Boolean).join(', '),
      city: cust.district,
      pincode: cust.pincode,
      state: cust.state,
    }));
  };

  useEffect(() => {
    // Cashfree full-page redirect return: verify payment, show success, skip the empty-cart bounce.
    const cfOrder = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('cf_order') : null;
    if (cfOrder) {
      setLoading(true);
      cashfreeApi.verify(cfOrder).then(v => {
        if (v.verified) { clearCart(); setOrderId(cfOrder); setStep('confirm'); }
        else { alert('Payment is not confirmed yet. If money was deducted, your order will be created automatically — or contact us on WhatsApp with order ID ' + cfOrder); router.push('/cart'); }
      }).catch(() => alert('Could not check payment status. Please contact us on WhatsApp with order ID ' + cfOrder))
      .finally(() => { setLoading(false); try { window.history.replaceState({}, '', '/checkout'); } catch {} });
      return;
    }
    const c = getCart();
    if (c.length === 0) { router.push('/cart'); return; }
    setCart(c);
    // GA4: user has reached checkout with items in the cart.
    trackEvent('begin_checkout', { currency: 'INR', value: cartTotal(c), items: cartToItems(c) });
    const cust = getCustomer();
    if (cust) applyCustomer(cust);
    const onAuth = () => {
      const next = getCustomer();
      if (next) applyCustomer(next);
    };
    window.addEventListener('auth-changed', onAuth);
    // Pre-fill PAN from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('mfh-pan') ?? '{}');
      if (saved.panNumber) setPanData({ panNumber: saved.panNumber, panName: saved.panName ?? '' });
    } catch {}
    return () => window.removeEventListener('auth-changed', onAuth);
  }, [router]);

  // Local Balotra delivery = free shipping. Shipping is normally baked into each item's
  // price; for a Balotra post office / pincode we drop it so the customer pays the base rate.
  const isBalotra = /balotra/i.test(shipping.city || '') || (shipping.pincode || '').trim() === '344022';
  const shipWaiver = isBalotra ? cartShipping(cart) : 0;
  // Per-item price actually charged (base for Balotra, base + shipping otherwise).
  const chargedUnit = (i: CartItem) => (isBalotra ? unitBase(i) : finalUnitPrice(i));
  const subtotal = cartTotal(cart) - shipWaiver;

  // Auto-apply a creator referral code (captured from a ?ref= link) so the order
  // is credited to the creator who shared it. Runs once after the cart is ready,
  // and only if the customer hasn't already applied a coupon themselves.
  const refTried = useRef(false);
  useEffect(() => {
    if (refTried.current || couponApplied || subtotal <= 0) return;
    let stored: { code?: string; ts?: number } = {};
    try { stored = JSON.parse(localStorage.getItem('mfh_ref') ?? '{}'); } catch {}
    if (!stored.code) return;
    // Referral expires after 30 days
    if (stored.ts && Date.now() - stored.ts > 30 * 24 * 60 * 60 * 1000) return;
    refTried.current = true;
    (async () => {
      try {
        const res = await couponsApi.validate(stored.code!, subtotal, customer?.id);
        setCouponApplied({ code: res.code, discount: res.discount, message: res.message });
      } catch { /* code not valid for this order — ignore */ }
    })();
  }, [subtotal, couponApplied]);

  const discount = couponApplied?.discount ?? 0;
  const shippingCost = 0;   // shipping is folded into item prices (or waived for Balotra); no separate charge
  // Cash on Delivery adds a flat ₹50 handling fee; online payment has none.
  const codFee = payMethod === 'cod' ? COD_FEE : 0;
  const total = Math.max(0, subtotal - discount) + codFee;
  const requiresPan = false;   // PAN no longer mandatory at checkout (disabled on request)

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(''); setCouponLoading(true);
    try {
      const res = await couponsApi.validate(couponCode, subtotal, customer?.id);
      setCouponApplied({ code: res.code, discount: res.discount, message: res.message });
      setCouponError('');
    } catch (e) {
      setCouponApplied(null);
      setCouponError((e as Error).message || 'Invalid coupon code.');
    } finally { setCouponLoading(false); }
  };

  const removeCoupon = () => {
    setCouponApplied(null); setCouponCode(''); setCouponError('');
  };

  // The coupon code the order is attributed to: a coupon the customer applied,
  // or — failing that — the creator referral code captured from a ?ref= link.
  // This credits the creator even when the coupon discount itself didn't apply.
  const attributionCode = (): string | undefined => {
    if (couponApplied?.code) return couponApplied.code;
    try {
      const s = JSON.parse(localStorage.getItem('mfh_ref') ?? '{}');
      if (s.code && (!s.ts || Date.now() - s.ts <= 30 * 24 * 60 * 60 * 1000)) return s.code;
    } catch { /* ignore */ }
    return undefined;
  };

  const buildCartLines = () => cart.map(i => {
    // Look up the selected colour's code / photo / column from the product's extraJson
    let colorCode = '', colorPhoto = '', colorColumn = '';
    if (i.selectedColor) {
      try {
        const ex = JSON.parse(i.extraJson ?? '{}');
        const cc = (ex.customColors ?? []).find((c: { name?: string }) => c.name === i.selectedColor);
        if (cc) { colorCode = cc.code ?? ''; colorPhoto = cc.photo ?? ''; colorColumn = cc.columnLetter ?? ''; }
        if (!colorCode) colorCode = (ex.colorCodes ?? {})[i.selectedColor] ?? '';
      } catch { /* extraJson missing or malformed — leave colour meta blank */ }
    }
    return {
      id: String(i.dbId),
      name: i.name,
      sku: i.sku ?? '',
      size: [i.selectedSize, i.selectedColor].filter(Boolean).join(' / '),
      image: i.image ?? '',
      quantity: i.quantity,
      price: chargedUnit(i),
      lineTotal: chargedUnit(i) * i.quantity,
      category: i.category,
      subcategory: i.subcategory,
      gstRate: i.gstRate ?? 5,
      hsn: i.hsnCode ?? '6211',
      // Structured colour info for admin order display
      color: i.selectedColor ?? '',
      colorCode,
      colorPhoto,
      colorColumn,
    };
  });

  const handlePincodeChange = (val: string) => {
    const state = val.length >= 2 ? getPincodeState(val) : '';
    setShipping(s => ({ ...s, pincode: val, ...(state ? { state } : {}) }));
  };

  const validateShipping = () => {
    if (!shipping.name || !shipping.phone || !shipping.address || !shipping.city || !shipping.pincode || !shipping.state) {
      alert('Please fill all shipping fields.');
      return false;
    }
    if (!/^[6-9]\d{9}$/.test((shipping.phone || '').replace(/\D/g, '').slice(-10))) {
      alert('Please enter a valid 10-digit mobile number.');
      return false;
    }
    if (!/^\d{6}$/.test(shipping.pincode || '')) {
      alert('Pincode must be 6 digits.');
      return false;
    }
    if ((shipping as any).email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((shipping as any).email)) {
      alert('Please enter a valid email address.');
      return false;
    }
    if (requiresPan) {
      if (!panData.panNumber || !panData.panName) {
        alert('PAN card details are required for orders above ₹2000.');
        return false;
      }
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(panData.panNumber.toUpperCase())) {
        alert('Please enter a valid PAN number (e.g. ABCDE1234F).');
        return false;
      }
    }
    return true;
  };

  // ── Cashfree (PRIMARY online gateway) ──────────────────────────────────────
  const handleCashfree = async (): Promise<boolean> => {
    const cartLines = buildCartLines();
    let res;
    try {
      res = await cashfreeApi.createOrder({
        amount: total,
        currency: 'INR',
        cart: cartLines,
        customer,
        shipping,
        customerId: customer?.id?.toString(),
        customerName: shipping.name,
        customerEmail: shipping.email || customer?.email || '',
        customerPhone: shipping.phone,
      });
    } catch (e) {
      // Cashfree not configured yet → signal caller to fall back to Razorpay.
      if ((e as Error).message?.toLowerCase().includes('not configured')) return false;
      throw e;
    }

    await ensureCashfreeSdk();
    // @ts-expect-error Cashfree SDK loaded via script tag
    const cashfree = window.Cashfree({ mode: res.mode === 'sandbox' ? 'sandbox' : 'production' });
    // Full-page redirect to Cashfree's hosted checkout. On success the page navigates
    // away and, after payment, Cashfree returns to /checkout?cf_order=<id> (via the
    // backend return_url) where the mount effect verifies and shows the success screen.
    // IMPORTANT: do NOT run verify()/alert() here — with '_self' the promise can resolve
    // while navigation is still pending, and a synchronous alert() would BLOCK that
    // redirect (leaving the user stuck on \"Payment not confirmed\"). Only surface a
    // genuine SDK error; otherwise let the redirect proceed.
    const result = await cashfree.checkout({
      paymentSessionId: res.paymentSessionId,
      redirectTarget: '_self',
    });
    if (result?.error) {
      alert('Payment could not be started: ' + (result.error?.message || 'Please try again.'));
    }
    setLoading(false);
    return true;
  };

  // Pay Online: Cashfree first; falls back to Razorpay only if Cashfree keys
  // are not configured (or admin has set paymentGateway=razorpay in Settings).
  const handlePayOnline = async () => {
    if (!validateShipping()) return;
    setLoading(true);
    try {
      let gateway = 'cashfree';
      try {
        const s = await settingsApi.getAll();
        if ((s.settings?.paymentGateway || '').toLowerCase() === 'razorpay') gateway = 'razorpay';
      } catch { /* settings unavailable — keep cashfree-first */ }

      if (gateway === 'cashfree') {
        const handled = await handleCashfree();
        if (handled) return;
      }
      await startRazorpay();
    } catch (e) {
      alert('Payment init failed: ' + (e as Error).message);
      setLoading(false);
    }
  };

  // Cash on Delivery: no gateway. Place the order directly with method 'cod'.
  // The ₹50 COD fee is also enforced server-side, so it can't be bypassed.
  const handlePlaceCod = async () => {
    if (!validateShipping()) return;
    setLoading(true);
    try {
      const cartLines = buildCartLines();
      // Unique order number: timestamp + 4 random digits — two orders in the same
      // millisecond can never collide (prevents duplicate order numbers site-wide).
      const localOrderId = 'MFH' + Date.now() + Math.floor(1000 + Math.random() * 9000);
      await ordersApi.place({
        id: localOrderId,
        method: 'cod',
        status: 'Pending',
        paymentId: '',
        cart: cartLines,
        subtotal,
        shippingCost,
        codFee: COD_FEE,
        total,
        customerId: customer?.id?.toString(),
        customerName: shipping.name,
        customerEmail: shipping.email,
        customerPhone: shipping.phone,
        panNumber: requiresPan ? panData.panNumber : undefined,
        panName: requiresPan ? panData.panName : undefined,
        couponCode: attributionCode(),
        discountAmount: couponApplied?.discount ?? 0,
        shippingName: shipping.name,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingPincode: shipping.pincode,
        shippingState: shipping.state,
        placedAt: new Date().toISOString(),
      });
      trackEvent('purchase', {
        transaction_id: localOrderId,
        currency: 'INR',
        value: total,
        coupon: attributionCode() || undefined,
        items: cartToItems(cart),
      });
      trackAdsConversion({ value: total, currency: 'INR', transactionId: localOrderId });
      clearCart();
      setOrderId(localOrderId);
      setStep('confirm');
      setLoading(false);
    } catch (e) {
      alert('Order failed: ' + (e as Error).message);
      setLoading(false);
    }
  };

  const startRazorpay = async () => {
    try {
      const cartLines = buildCartLines();
      const res = await paymentsApi.createOrder({
        amount: total,
        currency: 'INR',
        cart: cartLines,
        customer,
        shipping,
      });

      const options = {
        key: res.keyId,
        amount: res.amountPaise,
        currency: 'INR',
        order_id: res.orderId,
        name: 'Mahalaxmi Fashion Hub',
        prefill: {
          name: shipping.name,
          contact: shipping.phone,
          email: shipping.email || customer?.email || '',
        },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          await paymentsApi.verify({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          await ordersApi.place({
            id: res.localOrderId,
            method: 'razorpay',
            status: 'Pending',
            paymentId: response.razorpay_payment_id,
            cart: cartLines,
            subtotal,
            shippingCost,
            codFee: 0,
            total,
            customerId: customer?.id?.toString(),
            customerName: shipping.name,
            customerEmail: shipping.email,
            customerPhone: shipping.phone,
            panNumber: requiresPan ? panData.panNumber : undefined,
            panName: requiresPan ? panData.panName : undefined,
            couponCode: attributionCode(),
            discountAmount: couponApplied?.discount ?? 0,
            shippingName: shipping.name,
            shippingAddress: shipping.address,
            shippingCity: shipping.city,
            shippingPincode: shipping.pincode,
            shippingState: shipping.state,
            placedAt: new Date().toISOString(),
          });
          // GA4: successful purchase (fired before clearing the cart so items are still available).
          trackEvent('purchase', {
            transaction_id: res.localOrderId,
            currency: 'INR',
            value: total,
            coupon: attributionCode() || undefined,
            items: cartToItems(cart),
          });
          trackAdsConversion({ value: total, currency: 'INR', transactionId: res.localOrderId });
          clearCart();
          setOrderId(res.localOrderId);
          setStep('confirm');
          setLoading(false);
        },
        modal: { ondismiss: () => setLoading(false) },
      };
      // @ts-expect-error Razorpay loaded via script tag
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert('Payment init failed: ' + (e as Error).message);
      setLoading(false);
    }
  };

  if (step === 'confirm') return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#27ae60', marginBottom: '.5rem' }}>Order Placed!</h1>
      <p style={{ color: '#555', marginBottom: '.25rem' }}>Order ID: <strong>{orderId}</strong></p>
      <p style={{ color: '#666', fontSize: '.92rem', marginBottom: '1.5rem' }}>
        Message us on WhatsApp to get updates about your order:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', alignItems: 'center' }}>
        <a
          href={`https://wa.me/919429429880?text=${encodeURIComponent(`Hello Mahalaxmi Fashion Hub, I have just placed an order.\nOrder ID: ${orderId}\nPlease share my order updates here. Thank you.`)}`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.55rem', background: '#25D366', color: '#fff', fontWeight: 800, fontSize: '1rem', padding: '.9rem 1.7rem', borderRadius: 999, textDecoration: 'none', boxShadow: '0 6px 18px rgba(37,211,102,.35)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Get updates on WhatsApp
        </a>
        <button onClick={() => router.push('/')} className="button primary">Continue Shopping</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <script src="https://sdk.cashfree.com/js/v3/cashfree.js" async />
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />
      <style>{`
        @media (max-width: 700px) {
          .checkout-outer-grid { grid-template-columns: 1fr !important; }
          .checkout-shipping-grid { grid-template-columns: 1fr !important; }
          .checkout-pan-grid { grid-template-columns: 1fr !important; }
          .checkout-summary { position: static !important; }
        }
      `}</style>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem', color: '#a7354d' }}>Checkout</h1>

      <div className="checkout-outer-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', alignItems: 'start' }}>
        {/* Left: Shipping + Payment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!customer && (
            <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', border: '1.5px solid #f3d5dc', background: '#fff8f9' }}>
              <div>
                <strong style={{ color: '#a7354d' }}>Login to auto-fill shipping details</strong>
                <p style={{ margin: '.2rem 0 0', fontSize: '.85rem', color: '#666' }}>After login, your saved name, phone, email and address will fill automatically.</p>
              </div>
              <button type="button" onClick={() => router.push('/account?return=/checkout')} className="button primary" style={{ whiteSpace: 'nowrap' }}>
                Login
              </button>
            </div>
          )}

          {/* Shipping Form */}
          <div className="card" style={{ padding: '1.5rem' }}>
            {/* Honeypot — hidden from users, bots fill it */}
            <input type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)}
              style={{ display: 'none' }} tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1.25rem' }}>Shipping Details</h2>
            <div className="checkout-shipping-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Full Name */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Full Name *</label>
                <input value={shipping.name} onChange={e => setShipping(s => ({ ...s, name: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {/* Email */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Email</label>
                <input type="email" value={shipping.email} onChange={e => setShipping(s => ({ ...s, email: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {/* Phone */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Phone *</label>
                <input value={shipping.phone} onChange={e => setShipping(s => ({ ...s, phone: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {/* Pincode */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Pincode *</label>
                <input value={shipping.pincode} maxLength={6} onChange={e => handlePincodeChange(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {/* Address */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Address *</label>
                <input value={shipping.address} onChange={e => setShipping(s => ({ ...s, address: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {/* City */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>City / District *</label>
                <input value={shipping.city} onChange={e => setShipping(s => ({ ...s, city: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              {/* State */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>State *</label>
                <input value={shipping.state} onChange={e => setShipping(s => ({ ...s, state: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          {/* Delivery-time pincode check (below delivery address) */}
          <PincodeChecker />

          {/* PAN section (if required) */}
          {requiresPan && (
            <div className="card" style={{ padding: '1.5rem', border: '1.5px solid #f5c6cb', background: '#fff8f9' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '.5rem', color: '#a7354d' }}>PAN Card Details Required</h2>
              <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '1rem' }}>
                As per government regulations, PAN details are mandatory for orders above ₹2,000.
              </p>
              <div className="checkout-pan-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>PAN Number *</label>
                  <input value={panData.panNumber} onChange={e => setPanData(p => ({ ...p, panNumber: e.target.value.toUpperCase() }))}
                    placeholder="ABCDE1234F" maxLength={10}
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box', textTransform: 'uppercase' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Name as on PAN *</label>
                  <input value={panData.panName} onChange={e => setPanData(p => ({ ...p, panName: e.target.value }))}
                    placeholder="Full Name"
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>Payment Method</h2>

            {/* Choose Pay Online vs Cash on Delivery */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', border: `1.5px solid ${payMethod === 'online' ? '#a7354d' : '#ddd'}`, background: payMethod === 'online' ? '#fff8f9' : '#fff', borderRadius: '10px', padding: '.75rem .9rem', cursor: 'pointer' }}>
                <input type="radio" name="payMethod" checked={payMethod === 'online'} onChange={() => setPayMethod('online')} style={{ accentColor: '#a7354d' }} />
                <span style={{ fontWeight: 600, fontSize: '.92rem' }}>💳 Pay Online</span>
                <span style={{ fontSize: '.8rem', color: '#666' }}>UPI / Card / Net Banking</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', border: `1.5px solid ${payMethod === 'cod' ? '#a7354d' : '#ddd'}`, background: payMethod === 'cod' ? '#fff8f9' : '#fff', borderRadius: '10px', padding: '.75rem .9rem', cursor: 'pointer' }}>
                <input type="radio" name="payMethod" checked={payMethod === 'cod'} onChange={() => setPayMethod('cod')} style={{ accentColor: '#a7354d' }} />
                <span style={{ fontWeight: 600, fontSize: '.92rem' }}>🚚 Cash on Delivery</span>
                <span style={{ fontSize: '.8rem', color: '#c0392b', fontWeight: 600 }}>+₹{COD_FEE} extra</span>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {payMethod === 'online' ? (
                <button onClick={handlePayOnline} disabled={loading} className="button primary" style={{ width: '100%' }}>
                  {loading ? 'Processing…' : `💳 Pay Online — ₹${total.toLocaleString('en-IN')}`}
                </button>
              ) : (
                <button onClick={handlePlaceCod} disabled={loading} className="button primary" style={{ width: '100%' }}>
                  {loading ? 'Placing order…' : `🚚 Place COD Order — ₹${total.toLocaleString('en-IN')}`}
                </button>
              )}
              {payMethod === 'cod' && (
                <p style={{ fontSize: '.8rem', color: '#666', margin: 0, textAlign: 'center' }}>
                  A ₹{COD_FEE} handling fee is added for Cash on Delivery. Pay the total in cash when your order arrives.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="card checkout-summary" style={{ padding: '1.25rem', position: 'sticky', top: '1rem' }}>
          <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>Order Summary</h2>
          <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
            {cart.map(i => (
              <div key={`${i.dbId}-${i.selectedSize}-${i.selectedColor}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: '.5rem' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '.5rem' }}>{i.name} × {i.quantity}{[i.selectedSize, i.selectedColor].filter(Boolean).length ? ` (${[i.selectedSize, i.selectedColor].filter(Boolean).join(' / ')})` : ''}</span>
                <span style={{ flexShrink: 0 }}>₹{(chargedUnit(i) * i.quantity).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
          {/* Coupon Input */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '.75rem', marginBottom: '.5rem' }}>
            {couponApplied ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.85rem' }}>
                <span style={{ color: '#166534', fontWeight: 600 }}>🎟️ {couponApplied.code} — ₹{couponApplied.discount.toLocaleString('en-IN')} off</span>
                <button onClick={removeCoupon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '1rem' }} aria-label="Remove coupon">✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <input
                  value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  placeholder="Coupon code"
                  style={{ flex: 1, border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem', outline: 'none' }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                />
                <button onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}
                  style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 1rem', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', whiteSpace: 'nowrap', opacity: couponLoading ? .7 : 1 }}>
                  {couponLoading ? '...' : 'Apply'}
                </button>
              </div>
            )}
            {couponError && <p style={{ color: '#c0392b', fontSize: '.82rem', marginTop: '.3rem' }}>{couponError}</p>}
          </div>

          <div style={{ borderTop: '1px solid #eee', paddingTop: '.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem', marginBottom: '.4rem' }}>
              <span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem', marginBottom: '.4rem', color: '#27ae60' }}>
                <span>Discount ({couponApplied?.code})</span><span>−₹{discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            {isBalotra && shipWaiver > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem', marginBottom: '.4rem', color: '#27ae60' }}>
                <span>Local delivery (Balotra)</span><span>FREE</span>
              </div>
            )}
            {codFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem', marginBottom: '.4rem' }}>
                <span>COD charge</span><span>+₹{codFee.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem', paddingTop: '.5rem', borderTop: '1px solid #eee' }}>
              <span>Total</span>
              <span style={{ color: '#a7354d' }}>₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
