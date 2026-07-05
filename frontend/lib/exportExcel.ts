/**
 * exportExcel.ts
 * Browser-side Excel generation using SheetJS (xlsx).
 * Data comes from the existing admin API — no backend changes needed.
 */
import * as XLSX from 'xlsx';
import type { Product, Order, Customer } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(raw?: string | null) {
  if (!raw) return '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN');
}

function fmtINR(n: number | undefined | null) {
  if (n == null) return '';
  return Number(n).toFixed(2);
}

// ── GST helpers (apparel slab, prices are GST-INCLUSIVE) ──────────────────────
const HOME_STATE = 'rajasthan';
const GST_THRESHOLD = 2500;                 // ₹ per piece: ≤ ₹2500 → 5%, above → 18%
const RETURN_STATUSES = ['Return Requested', 'Return Transit', 'Return'];

/** Per-piece apparel slab. */
function slabRate(unitPrice: number): number {
  return unitPrice > GST_THRESHOLD ? 18 : 5;
}
/** Highest slab across an order's items — used as the order rate for the full (incl. shipping) value. */
function orderGstRate(o: Order): number {
  let rate = 5;
  (o.cart ?? []).forEach((i: any) => {
    const qty = Number(i.quantity ?? 1) || 1;
    const unit = Number(i.lineTotal ?? 0) / qty;
    if (slabRate(unit) === 18) rate = 18;
  });
  return rate;
}
/** Split a GST-inclusive amount into taxable base + GST at a given rate. */
function splitGst(inclAmount: number, rate: number) {
  const taxable = inclAmount / (1 + rate / 100);
  return { taxable, gst: inclAmount - taxable };
}
function isIntraState(o: Order): boolean {
  return String((o as any).shippingState ?? '').toLowerCase() === HOME_STATE;
}
function invoiceNo(o: Order): string {
  return ((o as any).invoiceNumber as string) || '—';
}
/** Credit-note number derived from the invoice, e.g. M/26-27/002 → CN/26-27/002. */
function creditNoteNo(o: Order): string {
  const inv = (o as any).invoiceNumber as string | undefined;
  if (inv) return 'CN' + inv.replace(/^[A-Za-z]+/, '');
  return 'CN-' + String(o.id).slice(-6);
}
const neg = (x: number) => -Number(x.toFixed(2));
const r2 = (x: number) => +Number(x.toFixed(2));

/** Net taxable base + GST for a set of orders (order-total incl. shipping, GST-inclusive,
 *  at the order's slab rate; returns/cancelled excluded → net figure). Used by the Reports page. */
export function productGstTotals(orders: Order[]) {
  let taxable = 0, gst = 0;
  orders
    .filter(o => o.status !== 'Cancelled' && !RETURN_STATUSES.includes(o.status))
    .forEach(o => {
      const s = splitGst(Number(o.total ?? 0), orderGstRate(o));
      taxable += s.taxable; gst += s.gst;
    });
  return { taxable, gst };
}

/** Parse sizes / colours / stock from product ExtraJson */
function parseExtra(product: Product) {
  if (!product.extraJson) return { sizes: [] as string[], colours: [] as any[], packOf: product.packOf ?? 1, gstRate: product.gstRate ?? 5, hsnCode: product.hsnCode ?? '' };
  try {
    const ex = typeof product.extraJson === 'string' ? JSON.parse(product.extraJson) : product.extraJson;
    return {
      sizes:    (ex.sizes   ?? []) as string[],
      colours:  (ex.colours ?? []) as any[],
      packOf:   ex.packOf   ?? product.packOf  ?? 1,
      gstRate:  ex.gstRate  ?? product.gstRate ?? 5,
      hsnCode:  ex.hsnCode  ?? product.hsnCode ?? '',
    };
  } catch {
    return { sizes: [], colours: [], packOf: product.packOf ?? 1, gstRate: product.gstRate ?? 5, hsnCode: product.hsnCode ?? '' };
  }
}

/** Trigger browser file download */
function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', type: 'binary' });
}

// ── PRODUCTS EXPORT ───────────────────────────────────────────────────────────

export function exportProducts(products: Product[]) {
  const ALL_SIZES = ['XS','S','M','L','XL','XXL','XXXL','Free Size','28','30','32','34','36','38','40','42'];

  // Detect which sizes actually appear across all products
  const usedSizes = new Set<string>();
  const usedColours = new Set<string>();
  products.forEach(p => {
    const ex = parseExtra(p);
    ex.sizes.forEach((s: string) => usedSizes.add(s));
    ex.colours.forEach((c: any) => usedColours.add(c.name ?? c.columnLetter ?? ''));
  });
  const sizeList    = ALL_SIZES.filter(s => usedSizes.has(s));
  const colourList  = Array.from(usedColours).filter(Boolean);

  // Header
  const baseHdr = ['SKU ID','Product Name','Category','Subcategory',
                    'Price (₹)','Discount Price (₹)','GST Rate (%)','HSN Code',
                    'Pack Of','Stock Status','Best Seller','Created At'];
  const sizeHdr    = sizeList.map(s => `Size: ${s}`);
  const colourHdr  = colourList.map(c => `Colour: ${c}`);
  const header = [...baseHdr, ...sizeHdr, ...colourHdr];

  const rows: (string | number)[][] = products.map(p => {
    const ex = parseExtra(p);
    const base: (string | number)[] = [
      p.sku ?? '',
      p.name,
      p.category,
      p.subcategory ?? '',
      Number(p.price),
      p.discountPrice != null ? Number(p.discountPrice) : '',
      ex.gstRate,
      ex.hsnCode,
      ex.packOf,
      p.stock,
      p.bestSeller ? 'Yes' : 'No',
      fmtDate((p as any).createdAt),
    ];
    // Size stock columns — from colours[*].stock or sizes array
    const sizeVals = sizeList.map(sz => {
      // Check if any colour has stock for this size
      const stockEntry = ex.colours.find((c: any) => c.sizeStocks?.[sz] != null);
      if (stockEntry) return stockEntry.sizeStocks[sz];
      // Fallback: check sizes array
      return ex.sizes.includes(sz) ? (p.qty ?? '') : '';
    });
    const colourVals = colourList.map(cn => {
      const c = ex.colours.find((c: any) => (c.name ?? c.columnLetter) === cn);
      return c ? (c.name ?? cn) : '';
    });
    return [...base, ...sizeVals, ...colourVals];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 45 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 9  }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ...sizeList.map(() => ({ wch: 11 })),
    ...colourList.map(() => ({ wch: 14 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  download(wb, `MFH_Products_${today()}.xlsx`);
}

// ── ORDERS EXPORT ─────────────────────────────────────────────────────────────

export function exportOrders(orders: Order[], label = '') {
  const header = [
    'Order ID','Date','Customer Name','Phone','Email',
    'City','State','Pincode',
    'Subtotal (₹)','Shipping (₹)','COD Fee (₹)','Total (₹)',
    'Payment Method','Status','AWB','Delivered At',
    'Items (SKU × Qty @ Price)',
  ];

  const rows = orders.map(o => {
    const items = (o.cart ?? [])
      .map((i: any) => `${i.sku ?? i.name} ×${i.quantity} @₹${i.lineTotal}`)
      .join(' | ');
    return [
      o.id,
      fmtDate(o.placedAt as any ?? o.createdAt as any),
      o.customerName ?? '',
      o.customerPhone ?? '',
      o.customerEmail ?? '',
      (o as any).shippingCity  ?? '',
      (o as any).shippingState ?? '',
      (o as any).shippingPincode ?? '',
      fmtINR(o.subtotal),
      fmtINR(o.shippingCost),
      fmtINR(o.codFee),
      fmtINR(o.total),
      o.method,
      o.status,
      o.awb ?? '',
      fmtDate((o as any).deliveredAt),
      items,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 26 },
    { wch: 16 }, { wch: 16 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    { wch: 60 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  download(wb, `MFH_Orders_${label || today()}.xlsx`);
}

// ── CUSTOMERS EXPORT ──────────────────────────────────────────────────────────

export function exportCustomers(customers: Customer[]) {
  const header = [
    'Customer Code','First Name','Last Name','Gender','Email','Phone',
    'Date of Birth','Anniversary Date',
    'Address Line 1','Address Line 2','Pincode','Post Office','District','State',
    'Account Status','Profile Status','Marketing Consent',
    'PAN Number','PAN Name','PAN Status',
    'Email Verified','Phone Verified','Joined On',
  ];

  const rows = customers.map(c => [
    c.customerCode ?? '',
    c.firstName,
    c.lastName,
    c.gender ?? '',
    c.email,
    c.phone ?? '',
    c.dateOfBirth   ? fmtDate(c.dateOfBirth)   : '',
    c.marriageDate  ? fmtDate(c.marriageDate)   : '',
    c.addrLine1 ?? '',
    c.addrLine2 ?? '',
    c.pincode   ?? '',
    c.postOffice ?? '',
    c.district  ?? '',
    c.state     ?? '',
    c.accountStatus ?? '',
    c.profileStatus ?? '',
    c.marketingConsent ? 'Yes' : 'No',
    c.panNumber ?? '',
    c.panName   ?? '',
    c.panStatus ?? '',
    c.emailVerified  ? 'Yes' : 'No',
    c.phoneVerified  ? 'Yes' : 'No',
    fmtDate(c.createdAt as any),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 28 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 14 }, { wch: 20 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  download(wb, `MFH_Customers_${today()}.xlsx`);
}

// ── GSTR-1 EXCEL ──────────────────────────────────────────────────────────────

export function exportGSTR1Excel(orders: Order[], from: string, to: string, packOf: Record<string, number> = {}) {
  const GSTIN = '08MUEPS5079K1ZM'; // Rajasthan — update via Settings if needed
  const pk = (sku?: string) => Math.max(1, Number(packOf[sku ?? ''] ?? 1));  // pieces per unit

  const header = [
    'Type','GSTIN of Supplier','Invoice / CN No','Invoice Date','Customer Name','Customer State',
    'HSN Code','Item Description','Quantity','Taxable Value (₹)','GST Rate (%)',
    'CGST (₹)','SGST (₹)','IGST (₹)','Invoice Value (₹)',
  ];

  const rows: (string | number)[][] = [];

  // 1) Sale invoices — every non-cancelled order (returned orders' original sale still counts,
  //    then its credit note reverses it below). Per-item slab GST on GST-inclusive line totals.
  orders
    .filter(o => o.status !== 'Cancelled')
    .forEach(o => {
      const date = fmtDate(o.placedAt as any ?? o.createdAt as any);
      const intra = isIntraState(o);
      (o.cart ?? []).forEach((item: any) => {
        const qty       = Number(item.quantity ?? 1) || 1;
        const lineTotal = Number(item.lineTotal ?? 0);
        const rate      = slabRate(lineTotal / qty);
        const { taxable, gst } = splitGst(lineTotal, rate);
        rows.push([
          'Sale Invoice', GSTIN, invoiceNo(o), date, o.customerName ?? '', (o as any).shippingState ?? '',
          item.hsn ?? item.hsnCode ?? '6211', item.name, qty * pk(item.sku),
          r2(taxable), rate,
          r2(intra ? gst / 2 : 0), r2(intra ? gst / 2 : 0), r2(intra ? 0 : gst),
          r2(lineTotal),
        ]);
      });
    });

  // 2) Credit notes (CDNR) — for returned orders, reversing the goods, negative values.
  orders
    .filter(o => RETURN_STATUSES.includes(o.status))
    .forEach(o => {
      const date = fmtDate(o.placedAt as any ?? o.createdAt as any);
      const intra = isIntraState(o);
      (o.cart ?? []).forEach((item: any) => {
        const qty       = Number(item.quantity ?? 1) || 1;
        const lineTotal = Number(item.lineTotal ?? 0);
        const rate      = slabRate(lineTotal / qty);
        const { taxable, gst } = splitGst(lineTotal, rate);
        rows.push([
          'Credit Note', GSTIN, creditNoteNo(o), date, o.customerName ?? '', (o as any).shippingState ?? '',
          item.hsn ?? item.hsnCode ?? '6211', `Return: ${item.name}`, -(qty * pk(item.sku)),
          neg(taxable), rate,
          neg(intra ? gst / 2 : 0), neg(intra ? gst / 2 : 0), neg(intra ? 0 : gst),
          neg(lineTotal),
        ]);
      });
    });

  // Summary row (columns shifted by +1 because of the leading "Type" column)
  const sumTaxable = rows.reduce((s, r) => s + (Number(r[9])  || 0), 0);
  const sumCGST    = rows.reduce((s, r) => s + (Number(r[11]) || 0), 0);
  const sumSGST    = rows.reduce((s, r) => s + (Number(r[12]) || 0), 0);
  const sumIGST    = rows.reduce((s, r) => s + (Number(r[13]) || 0), 0);
  const sumInv     = rows.reduce((s, r) => s + (Number(r[14]) || 0), 0);
  rows.push(['NET','','','','','','','TOTAL','', r2(sumTaxable),'', r2(sumCGST), r2(sumSGST), r2(sumIGST), r2(sumInv)]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 16 },
    { wch: 10 }, { wch: 40 }, { wch: 8  }, { wch: 16 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-1');
  download(wb, `GSTR1_${from}_to_${to}.xlsx`);
}

// ── SALES SUMMARY EXCEL ───────────────────────────────────────────────────────

export function exportSalesExcel(orders: Order[], from: string, to: string, packOf: Record<string, number> = {}) {
  const pk = (sku?: string) => Math.max(1, Number(packOf[sku ?? ''] ?? 1));  // pieces per unit
  // ── Sheet 1: Order Summary (familiar view + Invoice No + Credit Note No) ──
  const ordHdr = ['Order ID','Invoice No','Credit Note No','Date','Customer','Phone','City','State','Subtotal','Shipping','COD Fee','Total','Method','Status'];
  const ordRows: (string | number)[][] = orders.map(o => [
    o.id,
    invoiceNo(o),
    RETURN_STATUSES.includes(o.status) ? creditNoteNo(o) : '',
    fmtDate(o.placedAt as any ?? o.createdAt as any),
    o.customerName ?? '',
    o.customerPhone ?? '',
    (o as any).shippingCity  ?? '',
    (o as any).shippingState ?? '',
    r2(Number(o.subtotal)),
    r2(Number(o.shippingCost)),
    r2(Number(o.codFee)),
    r2(Number(o.total)),
    o.method,
    o.status,
  ]);
  const colSum = (idx: number) => ordRows.reduce((s, r) => s + (typeof r[idx] === 'number' ? r[idx] as number : 0), 0);
  const totTot = colSum(11);
  ordRows.push(['','','','','','','','TOTAL', r2(colSum(8)), r2(colSum(9)), r2(colSum(10)), r2(totTot), '', '']);

  const ws1 = XLSX.utils.aoa_to_sheet([ordHdr, ...ordRows]);
  ws1['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 13 }, { wch: 20 }, { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 16 },
  ];

  // ── Sheet 2: Sales & Credit Notes (GST ledger: sale rows + negative credit-note rows for returns) ──
  const ledHdr = ['Type','Invoice / CN No','Order ID','Date','Customer','State','Taxable Value (₹)','GST %','CGST (₹)','SGST (₹)','IGST (₹)','Doc Value (₹)','Status'];
  const ledRows: (string | number)[][] = [];
  orders.filter(o => o.status !== 'Cancelled').forEach(o => {
    const rate = orderGstRate(o);
    const intra = isIntraState(o);
    const date = fmtDate(o.placedAt as any ?? o.createdAt as any);
    const st = (o as any).shippingState ?? '';
    // Sale invoice (full order value incl. shipping, GST-inclusive at slab rate)
    const sale = splitGst(Number(o.total ?? 0), rate);
    ledRows.push(['Sale Invoice', invoiceNo(o), o.id, date, o.customerName ?? '', st,
      r2(sale.taxable), rate, r2(intra ? sale.gst / 2 : 0), r2(intra ? sale.gst / 2 : 0), r2(intra ? 0 : sale.gst),
      r2(Number(o.total)), o.status]);
    // Credit note for a returned order — reverse the goods value (subtotal), negative
    if (RETURN_STATUSES.includes(o.status)) {
      const goods = Number(o.total ?? 0);   // reverse the full sale (incl. shipping) on return
      const cn = splitGst(goods, rate);
      ledRows.push(['Credit Note (Return)', creditNoteNo(o), o.id, date, o.customerName ?? '', st,
        neg(cn.taxable), rate, neg(intra ? cn.gst / 2 : 0), neg(intra ? cn.gst / 2 : 0), neg(intra ? 0 : cn.gst),
        neg(goods), 'Return / CN']);
    }
  });
  const ws2 = XLSX.utils.aoa_to_sheet([ledHdr, ...ledRows]);
  ws2['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 13 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 15 }];

  // ── Sheet 3: GST Summary by Rate (net of return credit notes) ──
  const agg: Record<number, { taxable: number; gst: number }> = { 5: { taxable: 0, gst: 0 }, 18: { taxable: 0, gst: 0 } };
  let cnTaxable = 0, cnGst = 0;
  orders.filter(o => o.status !== 'Cancelled').forEach(o => {
    const rate = orderGstRate(o);
    const sale = splitGst(Number(o.total ?? 0), rate);
    agg[rate].taxable += sale.taxable; agg[rate].gst += sale.gst;
    if (RETURN_STATUSES.includes(o.status)) {
      const goods = Number(o.total ?? 0);   // reverse the full sale (incl. shipping) on return
      const cn = splitGst(goods, rate);
      cnTaxable += cn.taxable; cnGst += cn.gst;
    }
  });
  const gstHdr = ['Line','Taxable Value (₹)','CGST (₹)','SGST (₹)','Total GST (₹)'];
  const gstRows: (string | number)[][] = [
    ['Sales @ 5%',  r2(agg[5].taxable),  r2(agg[5].gst / 2),  r2(agg[5].gst / 2),  r2(agg[5].gst)],
    ['Sales @ 18%', r2(agg[18].taxable), r2(agg[18].gst / 2), r2(agg[18].gst / 2), r2(agg[18].gst)],
    ['Less: Credit Notes (Returns)', neg(cnTaxable), neg(cnGst / 2), neg(cnGst / 2), neg(cnGst)],
  ];
  const netTaxable = agg[5].taxable + agg[18].taxable - cnTaxable;
  const netGst = agg[5].gst + agg[18].gst - cnGst;
  gstRows.push(['NET GST PAYABLE', r2(netTaxable), r2(netGst / 2), r2(netGst / 2), r2(netGst)]);
  const ws2b = XLSX.utils.aoa_to_sheet([gstHdr, ...gstRows]);
  ws2b['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

  // ── Sheet 4: Status breakdown ──
  const statusMap: Record<string, { count: number; total: number }> = {};
  orders.forEach(o => {
    const s = o.status;
    if (!statusMap[s]) statusMap[s] = { count: 0, total: 0 };
    statusMap[s].count++;
    statusMap[s].total += Number(o.total);
  });
  const stHdr = ['Status','Order Count','Total Revenue (₹)'];
  const stRows: (string | number)[][] = Object.entries(statusMap).map(([st, v]) => [st, v.count, r2(v.total)]);
  stRows.push(['TOTAL', orders.length, r2(totTot)]);
  const ws3s = XLSX.utils.aoa_to_sheet([stHdr, ...stRows]);
  ws3s['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }];

  // ── Sheet 5: SKU-wise sales
  const skuMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders
    .filter(o => !['Cancelled','Return'].includes(o.status))
    .forEach(o => {
      (o.cart ?? []).forEach((item: any) => {
        const key = item.sku ?? item.name;
        if (!skuMap[key]) skuMap[key] = { name: item.name, qty: 0, revenue: 0 };
        skuMap[key].qty     += (Number(item.quantity ?? 1) || 1) * pk(item.sku);
        skuMap[key].revenue += Number(item.lineTotal ?? 0);
      });
    });
  const skuHdr = ['SKU / Product','Name','Qty Sold','Revenue (₹)'];
  const skuRows = Object.entries(skuMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([sku, v]) => [sku, v.name, v.qty, +v.revenue.toFixed(2)]);

  const ws3 = XLSX.utils.aoa_to_sheet([skuHdr, ...skuRows]);
  ws3['!cols'] = [{ wch: 16 }, { wch: 45 }, { wch: 10 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1,  'Order Summary');
  XLSX.utils.book_append_sheet(wb, ws2,  'Sales & Credit Notes');
  XLSX.utils.book_append_sheet(wb, ws2b, 'GST Summary');
  XLSX.utils.book_append_sheet(wb, ws3s, 'Status Summary');
  XLSX.utils.book_append_sheet(wb, ws3,  'SKU Sales');
  download(wb, `MFH_Sales_${from}_to_${to}.xlsx`);
}

// ── GSTR-1 GOVERNMENT OFFLINE-TOOL TEMPLATE ───────────────────────────────────
// Produces the b2cs, hsn and docs sheets in the exact column layout of the govt
// "GSTR1_Excel_Workbook_Template". Copy the rows into the official offline tool
// (or import) to file. Quantities are counted in PIECES (units × pack-of).

const STATE_CODES: Record<string, string> = {
  'jammu and kashmir':'01','himachal pradesh':'02','punjab':'03','chandigarh':'04',
  'uttarakhand':'05','haryana':'06','delhi':'07','rajasthan':'08','uttar pradesh':'09',
  'bihar':'10','sikkim':'11','arunachal pradesh':'12','nagaland':'13','manipur':'14',
  'mizoram':'15','tripura':'16','meghalaya':'17','assam':'18','west bengal':'19',
  'jharkhand':'20','odisha':'21','chhattisgarh':'22','madhya pradesh':'23','gujarat':'24',
  'maharashtra':'27','karnataka':'29','goa':'30','lakshadweep':'31','kerala':'32',
  'tamil nadu':'33','puducherry':'34','andaman and nicobar islands':'35','telangana':'36',
  'andhra pradesh':'37','ladakh':'38',
};
function posLabel(state?: string): string {
  const s = String(state ?? '').trim().toLowerCase();
  const nice = (state ?? '').trim().replace(/\b\w/g, c => c.toUpperCase());
  const code = STATE_CODES[s];
  return code ? `${code}-${nice}` : nice;
}

export function exportGSTR1GovTemplate(
  orders: Order[], from: string, to: string, packOf: Record<string, number> = {},
) {
  const pk = (sku?: string) => Math.max(1, Number(packOf[sku ?? ''] ?? 1));

  const b2cs: Record<string, { pos: string; rate: number; taxable: number }> = {};
  const hsn:  Record<string, { hsn: string; rate: number; qty: number; value: number; taxable: number; igst: number; cgst: number; sgst: number }> = {};

  const addLine = (o: Order, item: any, sign: number) => {
    const units = Number(item.quantity ?? 1) || 1;
    const line  = Number(item.lineTotal ?? 0) * sign;
    const rate  = slabRate(Number(item.lineTotal ?? 0) / units);
    const { taxable, gst } = splitGst(line, rate);
    const intra = isIntraState(o);
    // B2CS — aggregated by place-of-supply + rate (net of returns)
    const pos = posLabel((o as any).shippingState);
    const bk = `${pos}|${rate}`;
    (b2cs[bk] ||= { pos, rate, taxable: 0 }).taxable += taxable;
    // HSN — quantity in pieces (units × pack-of)
    const code = item.hsn || item.hsnCode || '6211';
    const hk = `${code}|${rate}`;
    const h = (hsn[hk] ||= { hsn: code, rate, qty: 0, value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 });
    h.qty += units * pk(item.sku) * sign; h.value += line; h.taxable += taxable;
    if (intra) { h.cgst += gst / 2; h.sgst += gst / 2; } else { h.igst += gst; }
  };
  orders.filter(o => o.status !== 'Cancelled').forEach(o => (o.cart ?? []).forEach(it => addLine(o, it, 1)));
  orders.filter(o => RETURN_STATUSES.includes(o.status)).forEach(o => (o.cart ?? []).forEach(it => addLine(o, it, -1)));

  // b2cs sheet
  const b2csHdr = ['Type','Place Of Supply','Applicable % of Tax Rate','Rate','Taxable Value','Cess Amount','E-Commerce GSTIN'];
  const b2csRows = Object.values(b2cs).filter(v => Math.abs(v.taxable) > 0.001)
    .map(v => ['OE', v.pos, '', v.rate, r2(v.taxable), '', '']);
  const wsB = XLSX.utils.aoa_to_sheet([['Summary For B2CS(7)'], [], [], b2csHdr, ...b2csRows]);
  wsB['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 18 }];

  // hsn sheet
  const hsnHdr = ['HSN','Description','UQC','Total Quantity','Total Value','Rate','Taxable Value','Integrated Tax Amount','Central Tax Amount','State/UT Tax Amount','Cess Amount'];
  const hsnRows = Object.values(hsn)
    .map(h => [h.hsn, '', 'PCS-PIECES', r2(h.qty), r2(h.value), h.rate, r2(h.taxable), r2(h.igst), r2(h.cgst), r2(h.sgst), '']);
  const wsH = XLSX.utils.aoa_to_sheet([['Summary For HSN(12)'], [], [], hsnHdr, ...hsnRows]);
  wsH['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];

  // docs sheet
  const invs = orders.filter(o => o.status !== 'Cancelled');
  const canc = orders.filter(o => o.status === 'Cancelled');
  const docsHdr = ['Nature of Document','Sr. No. From','Sr. No. To','Total Number','Cancelled'];
  const docsRows = [[
    'Invoices for outward supply',
    invs.length ? invoiceNo(invs[0]) : '',
    invs.length ? invoiceNo(invs[invs.length - 1]) : '',
    invs.length, canc.length,
  ]];
  const wsD = XLSX.utils.aoa_to_sheet([['Summary of documents issued during the tax period (13)'], [], [], docsHdr, ...docsRows]);
  wsD['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsB, 'b2cs');
  XLSX.utils.book_append_sheet(wb, wsH, 'hsn');
  XLSX.utils.book_append_sheet(wb, wsD, 'docs');
  download(wb, `GSTR1_GovTemplate_${from}_to_${to}.xlsx`);
}
