export interface Product {
  dbId: number;
  sku?: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  discountPrice?: number;
  maxPrice?: number;
  shippingCharge?: number;
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
  // Kis dukaan ka maal. Sirf admin panel me dikhta hai.
  shopName?: string;
}

export interface CartItem extends Product {
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
  maxStock?: number;   // available stock for this size×colour variant (caps quantity)
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
  birthdayOfferUsed?: boolean;
  anniversaryOfferUsed?: boolean;
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
  photoUrl?: string;
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
  // Order ke saath likha hua nahi aata — server har baar SKU se product ki
  // pankti dekhkar bharta hai, isliye purane orders par bhi dikhta hai.
  shopName?: string;
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
  // Paid online before a COD order was accepted. The courier must collect
  // (total - walletUsed - advancePaid), never the full total.
  advancePaid?: number;
  walletUsed?: number;
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
  /**
   * When Delhivery expects to deliver it — their date, not ours, taken from
   * the tracking sweep. Absent until the parcel has a waybill and the courier
   * has said something, and left blank on screen when it is: a made-up date is
   * worse than none, because it is the one the shop would repeat to a customer.
   */
  expectedDelivery?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  invoiceNumber?: string;
  /** The code printed on the thaili this parcel went into, scanned at packing. */
  bagBarcode?: string | null;
  /** What Delhivery last said about this parcel, and the sentence under it. */
  courierStatus?: string | null;
  courierNote?: string | null;
  courierSeenAt?: string | null;
  // When the invoice number was issued, and so the invoice's own date. Falls
  // back to placedAt for orders invoiced before this was recorded.
  invoicedAt?: string | null;
  courier?: string;
  returnIssue?: string;
  returnReason?: string;
  returnCallback?: string;
  returnOpeningVideo?: string;
  returnClosingVideo?: string;
  returnOpeningPhotos?: string[];
  returnClosingPhotos?: string[];
  returnDecision?: string;        // "approved" | "rejected"
  returnDecisionAt?: string;
  returnRejectReason?: string;
  returnMediaPurgeAt?: string;    // when rejected media auto-deletes
  returnMediaDeleted?: boolean;
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
