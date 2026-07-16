const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ?? (typeof window === 'undefined' ? 'http://localhost:5000/api' : '/api');

async function request<T>(
  path: string,
  options?: RequestInit,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Server-side GET requests: use Next.js Data Cache (revalidate every 60s so newly-added
  // products/settings show up quickly on cached pages like the homepage).
  const isServer = typeof window === 'undefined';
  const isGet = !options?.method || options.method === 'GET';
  const cacheOpts: RequestInit = isServer && isGet ? { next: { revalidate: 60 } } as RequestInit : {};

  const res = await fetch(`${API_BASE}${path}`, { ...cacheOpts, ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText || `Error ${res.status}` }));
    // Handle ASP.NET Core validation errors (have 'title'/'errors' but no 'message')
    const msg = err.message || err.title || (err.errors ? JSON.stringify(err.errors) : null) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

// ── Products ─────────────────────────────────────────────────────────────────
export const productsApi = {
  getAll: (params?: {
    category?: string;
    subcategory?: string;
    bestSeller?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return request<{ success: boolean; products: import('@/types').Product[]; total: number }>(
      `/products${qs ? '?' + qs : ''}`
    );
  },
  getById: (id: number) =>
    request<{ success: boolean; product: import('@/types').Product }>(`/products/${id}`),
  nextSku: (token: string) =>
    request<{ sku: string }>('/products/next-sku', {}, token),
  bulkSave: (products: unknown[], token: string) =>
    request('/products', { method: 'POST', body: JSON.stringify({ products }) }, token),
  update: (id: number, data: unknown, token: string) =>
    request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),
  // Lightweight stock-only toggle (no need to resend the whole product)
  updateStock: (id: number, stock: string, token: string) =>
    request<{ success: boolean; product: import('@/types').Product }>(
      `/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) }, token
    ),
  delete: (id: number, token: string) =>
    request(`/products/${id}`, { method: 'DELETE' }, token),
};

// ── Orders ───────────────────────────────────────────────────────────────────
export const ordersApi = {
  getAll: (params?: { customerId?: string; email?: string; phone?: string }, token?: string) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => v).map(([k, v]) => [k, v!])
    ).toString();
    return request<{ success: boolean; orders: import('@/types').Order[] }>(
      `/orders${qs ? '?' + qs : ''}`,
      undefined,
      token
    );
  },
  getById: (id: string, token?: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(`/orders/${id}`, undefined, token),
  // Delhivery pincode serviceability + COD + delivery-day estimate (public).
  checkPincode: (pin: string) =>
    request<{
      success: boolean; known: boolean; serviceable: boolean; cod: boolean;
      city?: string; state?: string; etaMinDays: number; etaMaxDays: number;
    }>(`/orders/pincode/${encodeURIComponent(pin)}`),
  // Live Delhivery tracking timeline (public, shipment-safe fields only).
  liveTrack: (awb: string) =>
    request<{
      success: boolean; live: boolean; orderId: string; siteStatus: string;
      courierStatus?: string; expectedDate?: string;
      scans?: Array<{ time: string; location: string; remark: string }>;
    }>(`/orders/live-track/${encodeURIComponent(awb)}`),
  place: (order: unknown) =>
    request<{ success: boolean; orderId: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    }),
  cancel: (orderId: string, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      `/orders/${orderId}/cancel`, { method: 'PATCH' }, token
    ),
  // Auto-generate a forward Delhivery AWB for an order.
  generateAwb: (orderId: string, token: string) =>
    request<{ success: boolean; awb?: string; order?: import('@/types').Order; message?: string }>(
      `/orders/${orderId}/generate-awb`, { method: 'POST' }, token
    ),
  requestReturn: (orderId: string, details: { issue?: string; invoiceNumber?: string; awb?: string; paymentMethod?: string; description?: string; callback?: string; openingVideo?: string; closingVideo?: string; openingPhotos?: string[]; closingPhotos?: string[] } | string, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      `/orders/${orderId}/return`,
      { method: 'POST', body: JSON.stringify(typeof details === 'string' ? { reason: details } : { reason: details.description, ...details }) },
      token
    ),
  // Upload ONE return photo/video (called per file). kind ∈ openingVideo|closingVideo|openingPhoto|closingPhoto
  uploadReturnMedia: async (orderId: string, file: File, kind: string, token: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    const res = await fetch(`${API_BASE}/orders/${orderId}/return-media`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(e.message || `Upload failed (${res.status})`);
    }
    return res.json() as Promise<{ success: boolean; url: string }>;
  },
  // BUG-1: getByCustomer removed — /orders/my endpoint does not exist on backend
  // Use getAll({ email }) or getAll({ phone }) instead
  updateStatus: (data: { orderId: string; status: string; awb?: string; courier?: string }, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      '/orders/status', { method: 'PATCH', body: JSON.stringify(data) }, token
    ),
  // Admin: approve (media deleted now) or reject (media kept 30 days, reason required) a return
  returnDecision: (orderId: string, decision: 'approve' | 'reject', reason: string, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      `/orders/${orderId}/return-decision`,
      { method: 'POST', body: JSON.stringify({ decision, reason }) },
      token
    ),
  // Admin: assign a reverse-pickup AWB. mode 'manual' (paste AWB) or 'auto' (Delhivery generates it).
  assignReturnAwb: (orderId: string, data: { mode: 'manual' | 'auto'; awb?: string; courier?: string }, token: string) =>
    request<{ success: boolean; order: import('@/types').Order; awb: string; courier: string }>(
      `/orders/${orderId}/return-awb`,
      { method: 'POST', body: JSON.stringify(data) },
      token
    ),
};

// ── Customers ────────────────────────────────────────────────────────────────
export const customersApi = {
  // token is passed when an ADMIN creates a customer from the panel (bypasses OTP).
  register: (data: unknown, token?: string) =>
    request<{ success: boolean; token: string; customer: import('@/types').Customer }>(
      '/customers/register', { method: 'POST', body: JSON.stringify(data) }, token
    ),
  login: (data: { email: string; password: string }) =>
    request<{ success: boolean; token: string; customer: import('@/types').Customer }>(
      '/customers/login', { method: 'POST', body: JSON.stringify(data) }
    ),
  sendOtp: (phone: string, purpose = 'login') =>
    request('/customers/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, purpose }),
    }),
  sendEmailOtp: (email: string, purpose = 'login') =>
    request('/customers/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
    }),
  verifyOtp: (phone: string, otp: string) =>
    request<{ success: boolean; token?: string; customer?: import('@/types').Customer; newUser?: boolean }>(
      '/customers/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) }
    ),
  forgotPasswordSendOtp: (identifier: string) =>
    request<{ success: boolean; sentTo?: { email?: string | null; phone?: string | null }; devOtp?: string }>(
      '/customers/forgot-password/send-otp',
      { method: 'POST', body: JSON.stringify({ identifier }) }
    ),
  resetPassword: (data: { email: string; otp: string; password: string }) =>
    request('/customers/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (id: number, data: unknown, token: string) =>
    request<{ success: boolean; customer: import('@/types').Customer }>(
      `/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token
    ),
  deactivate: (id: number, reason: string, token: string) =>
    request<{ success: boolean; customer: import('@/types').Customer }>(
      `/customers/${id}/deactivate`, { method: 'PATCH', body: JSON.stringify({ reason }) }, token
    ),
  delete: (id: number, token: string) =>
    request(`/customers/${id}`, { method: 'DELETE' }, token),
  getAll: (token: string, params?: { search?: string; page?: number }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<{ success: boolean; customers: import('@/types').Customer[]; total: number }>(
      `/customers${qs ? '?' + qs : ''}`, undefined, token
    );
  },
};

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  adminLogin: (email: string, password: string) =>
    request<{ success: boolean; token: string }>('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  changeAdminPassword: (newPassword: string, token: string) =>
    request<{ success: boolean }>('/auth/admin-change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }, token),
  me: (token: string) => request<{ success: boolean; email: string; role: string }>('/auth/me', undefined, token),
};

// ── Settings ─────────────────────────────────────────────────────────────────
// Client-side settings cache: layout, navbar, footer, offer banner, whatsapp float, etc. all
// request /settings on the same page load. We dedupe those into ONE network call and reuse the
// result briefly, instead of firing 6+ identical requests. (Server rendering keeps using Next's
// own per-request data cache.) Any admin save clears the cache so changes show on the next load.
type SettingsResp = { success: boolean; settings: Record<string, string> };
let _settingsCache: { at: number; data: SettingsResp } | null = null;
let _settingsInflight: Promise<SettingsResp> | null = null;
const SETTINGS_TTL = 30_000;

export const settingsApi = {
  getAll: (): Promise<SettingsResp> => {
    if (typeof window === 'undefined')
      return request<SettingsResp>('/settings');            // server: use Next data cache
    const now = Date.now();
    if (_settingsCache && now - _settingsCache.at < SETTINGS_TTL)
      return Promise.resolve(_settingsCache.data);          // fresh enough — reuse
    if (_settingsInflight) return _settingsInflight;        // a request is already in flight — join it
    _settingsInflight = request<SettingsResp>('/settings')
      .then(data => { _settingsCache = { at: Date.now(), data }; return data; })
      .finally(() => { _settingsInflight = null; });
    return _settingsInflight;
  },
  upsert: (key: string, value: string, token: string) => {
    _settingsCache = null;                                  // invalidate so the change shows up
    return request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }, token);
  },
  bulkUpsert: (settings: Record<string, string>, token: string) => {
    _settingsCache = null;                                  // invalidate so the change shows up
    return request('/settings/bulk', { method: 'POST', body: JSON.stringify(settings) }, token);
  },
  // Upload a site image (hero photos etc.) — admin only; returns its URL.
  uploadImage: async (file: File, token: string): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/settings/upload-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(e.message || `Upload failed (${res.status})`);
    }
    const j = await res.json();
    return j.url as string;
  },
};

// ── Payments ─────────────────────────────────────────────────────────────────
export const paymentsApi = {
  createOrder: (data: unknown) =>
    request<{ success: boolean; orderId: string; localOrderId: string; keyId: string; amountPaise: number }>(
      '/payments/create-order', { method: 'POST', body: JSON.stringify(data) }
    ),
  verify: (data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    request('/payments/verify', { method: 'POST', body: JSON.stringify(data) }),
  reconcile: (from: string, to: string, token: string) =>
    request<{
      success: boolean;
      summary: {
        totalPayments: number; matched: number; amountMismatch: number;
        paymentWithoutOrder: number; orderWithoutPayment: number;
        refunded: number; failed: number; capturedTotal: number; refundedTotal: number;
      };
      rows: ReconcileRow[];
    }>(`/payments/reconcile?from=${from}&to=${to}`, undefined, token),
};

// ── Cashfree (primary online gateway) ────────────────────────────────────────
export const cashfreeApi = {
  createOrder: (data: {
    amount: number; currency?: string; cart?: unknown; customer?: unknown; shipping?: unknown;
    customerId?: string; customerName?: string; customerEmail?: string; customerPhone?: string;
  }) =>
    request<{ success: boolean; setupRequired?: boolean; paymentSessionId: string; localOrderId: string; mode: string }>(
      '/cashfree/create-order', { method: 'POST', body: JSON.stringify(data) }
    ),
  verify: (localOrderId: string) =>
    request<{ success: boolean; verified: boolean; orderStatus: string; paymentId?: string | null }>(
      '/cashfree/verify', { method: 'POST', body: JSON.stringify({ localOrderId }) }
    ),
};

export interface ReconcileRow {
  category: 'MATCHED' | 'AMOUNT_MISMATCH' | 'PAYMENT_NO_ORDER' | 'ORDER_NO_PAYMENT';
  paymentId?: string | null;
  paymentAmount?: number | null;
  refundedAmount: number;
  paymentStatus?: string | null;
  paymentDate?: string | null;
  email: string;
  contact: string;
  orderId?: string | null;
  orderTotal?: number | null;
  orderStatus?: string | null;
}

// ── Coupons ───────────────────────────────────────────────────────────────────
export const couponsApi = {
  validate: (code: string, orderAmount: number, customerId?: number) =>
    request<{ success: boolean; code: string; type: string; value: number; discount: number; message: string }>(
      '/coupons/validate', { method: 'POST', body: JSON.stringify({ code, orderAmount, customerId }) }
    ),
  list: (token: string) =>
    request<unknown[]>('/coupons', undefined, token),
  create: (data: unknown, token: string) =>
    request<{ success: boolean; id: number }>('/coupons', { method: 'POST', body: JSON.stringify(data) }, token),
  update: (id: number, data: unknown, token: string) =>
    request('/coupons/' + id, { method: 'PUT', body: JSON.stringify(data) }, token),
  delete: (id: number, token: string) =>
    request('/coupons/' + id, { method: 'DELETE' }, token),
};

// ── Staff ─────────────────────────────────────────────────────────────────────
export const staffApi = {
  list: (token: string) =>
    request<Array<{ id: number; name: string; username: string; email?: string; role: string; isActive: boolean; lastLogin?: string; createdAt?: string }>>(
      '/staff', undefined, token),
  create: (data: { name: string; username: string; email?: string; password: string; role: string }, token: string) =>
    request<{ message: string; id: number }>('/staff', { method: 'POST', body: JSON.stringify(data) }, token),
  remove: (id: number, token: string) =>
    request('/staff/' + id, { method: 'DELETE' }, token),
  resetPassword: (id: number, newPassword: string, token: string) =>
    request('/staff/' + id + '/reset-password', { method: 'PUT', body: JSON.stringify({ newPassword }) }, token),
  toggleActive: (id: number, token: string) =>
    request<{ isActive: boolean }>('/staff/' + id + '/toggle-active', { method: 'PUT' }, token),
};

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const suppliersApi = {
  apply: (data: Record<string, string>) =>
    request<{ success: boolean; message: string }>(
      '/suppliers', { method: 'POST', body: JSON.stringify(data) }
    ),
};

// ── Reviews ───────────────────────────────────────────────────────────────────
export const reviewsApi = {
  getPending: (token: string) =>
    request<{ success: boolean; reviews: import('@/types').Review[] }>('/reviews/pending', undefined, token),
  getByProduct: (productId: number) =>
    request<{ success: boolean; reviews: import('@/types').Review[] }>(`/reviews/product/${productId}`),
  submit: (data: { productId: number; rating: number; text: string; orderId?: string; images?: string[] }, token: string) =>
    request<{ success: boolean }>('/reviews', { method: 'POST', body: JSON.stringify(data) }, token),
  // Upload ONE review photo (called per file); returns its URL to include in submit().
  uploadImage: async (file: File, token: string): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/reviews/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(e.message || `Upload failed (${res.status})`);
    }
    const j = await res.json();
    return j.url as string;
  },
  approve: (id: number, token: string) =>
    request(`/reviews/${id}/approve`, { method: 'PATCH' }, token),
  reject: (id: number, token: string) =>
    request(`/reviews/${id}/reject`, { method: 'PATCH' }, token),
  delete: (id: number, token: string) =>
    request(`/reviews/${id}`, { method: 'DELETE' }, token),
};
