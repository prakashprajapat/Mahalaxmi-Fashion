export interface Product {
  dbId: number;
  sku?: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  discountPrice?: number;
  maxPrice?: number;
  stock: string;
  description?: string;
  newest: number;
  image?: string;
  bestSeller: boolean;
  extraJson?: string;
  hsnCode?: string;
  gstRate?: number;
  qty?: number;
  stockQty?: number;
  packOf?: number;
  reviewCount?: number;
  avgRating?: number;
  soldCount?: number;
}

export interface CartItem extends Product {
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

export interface Customer {
  id: number;
  customerCode: string;
  firstName: string;
  lastName: string;
  gender: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  marriageDate?: string;
  addrLine1: string;
  addrLine2: string;
  pincode: string;
  postOffice: string;
  state: string;
  district: string;
  accountStatus: string;
  profileStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  marketingConsent?: boolean;
  panNumber?: string;
  panName?: string;
  panStatus?: string;
  createdAt: string;
}

export interface CartLine {
  id: string;
  name: string;
  sku: string;
  size: string;
  image: string;
  quantity: number;
  price: number;
  lineTotal: number;
  category: string;
  subcategory: string;
  gstRate: number;
  hsn: string;
  // Structured colour info captured at checkout (new orders only)
  color?: string;
  colorCode?: string;
  colorPhoto?: string;
  colorColumn?: string;
}

export interface Order {
  id: string;
  paymentId?: string;
  method: string;
  status: string;
  cart: CartLine[];
  subtotal: number;
  shippingCost: number;
  codFee: number;
  total: number;
  awb?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingName?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingPincode?: string;
  shippingState?: string;
  placedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  invoiceNumber?: string;
  courier?: string;
}

export interface Review {
  id: number;
  productId: number;
  productName?: string;
  customerId?: number;
  customerName?: string;
  rating: number;
  text: string;
  status?: 'pending' | 'approved' | 'rejected';
  orderId?: string;
  createdAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}
