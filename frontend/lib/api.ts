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

  // Server-side GET requests: use Next.js Data Cache (revalidate every 300s)
  const isServer = typeof window === 'undefined';
  const isGet = !options?.method || options.method === 'GET';
  const cacheOpts: RequestInit = isServer && isGet ? { next: { revalidate: 300 } } as RequestInit : {};

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
  place: (order: unknown) =>
    request<{ success: boolean; orderId: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    }),
  cancel: (orderId: string, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      `/orders/${orderId}/cancel`, { method: 'PATCH' }, token
    ),
  requestReturn: (orderId: string, reason: string, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      `/orders/${orderId}/return`, { method: 'POST', body: JSON.stringify({ reason }) }, token
    ),
  // BUG-1: getByCustomer removed — /orders/my endpoint does not exist on backend
  // Use getAll({ email }) or getAll({ phone }) instead
  updateStatus: (data: { orderId: string; status: string; awb?: string }, token: string) =>
    request<{ success: boolean; order: import('@/types').Order }>(
      '/orders/status', { method: 'PATCH', body: JSON.stringify(data) }, token
    ),
};

// ── Customers ────────────────────────────────────────────────────────────────
export const customersApi = {
  register: (data: unknown) =>
    request<{ success: boolean; token: string; customer: import('@/types').Customer }>(
      '/customers/register', { method: 'POST', body: JSON.stringify(data) }
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
export const settingsApi = {
  getAll: () => request<{ success: boolean; settings: Record<string, string> }>('/settings'),
  upsert: (key: string, value: string, token: string) =>
    request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }, token),
  bulkUpsert: (settings: Record<string, string>, token: string) =>
    request('/settings/bulk', { method: 'POST', body: JSON.stringify(settings) }, token),
};

// ── Payments ─────────────────────────────────────────────────────────────────
export const paymentsApi = {
  createOrder: (data: unknown) =>
    request<{ success: boolean; orderId: string; localOrderId: string; keyId: string; amountPaise: number }>(
      '/payments/create-order', { method: 'POST', body: JSON.stringify(data) }
    ),
  verify: (data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    request('/payments/verify', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Coupons ───────────────────────────────────────────────────────────────────
export const couponsApi = {
  validate: (code: string, orderAmount: number) =>
    request<{ success: boolean; code: string; type: string; value: number; discount: number; message: string }>(
      '/coupons/validate', { method: 'POST', body: JSON.stringify({ code, orderAmount }) }
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

// ── Reviews ───────────────────────────────────────────────────────────────────
export const reviewsApi = {
  getPending: (token: string) =>
    request<{ success: boolean; reviews: import('@/types').Review[] }>('/reviews/pending', undefined, token),
  getByProduct: (productId: number) =>
    request<{ success: boolean; reviews: import('@/types').Review[] }>(`/reviews/product/${productId}`),
  submit: (data: { productId: number; rating: number; text: string; orderId?: string }, token: string) =>
    request<{ success: boolean }>('/reviews', { method: 'POST', body: JSON.stringify(data) }, token),
  approve: (id: number, token: string) =>
    request(`/reviews/${id}/approve`, { method: 'PATCH' }, token),
  reject: (id: number, token: string) =>
    request(`/reviews/${id}/reject`, { method: 'PATCH' }, token),
  delete: (id: number, token: string) =>
    request(`/reviews/${id}`, { method: 'DELETE' }, token),
};
