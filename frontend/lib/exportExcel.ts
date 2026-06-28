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

export function exportGSTR1Excel(orders: Order[], from: string, to: string) {
  const GSTIN = '08MUEPS5079K1ZM'; // Rajasthan — update via Settings if needed
  const HOME_STATE = 'rajasthan';

  const header = [
    'GSTIN of Supplier','Invoice No','Invoice Date','Customer Name','Customer State',
    'HSN Code','Item Description','Quantity','Taxable Value (₹)','GST Rate (%)',
    'CGST (₹)','SGST (₹)','IGST (₹)','Invoice Value (₹)',
  ];

  const rows: (string | number)[][] = [];

  orders
    .filter(o => !['Cancelled', 'Return', 'Return Transit', 'Return Requested'].includes(o.status))
    .forEach(o => {
      const date = fmtDate(o.placedAt as any ?? o.createdAt as any);
      const state = ((o as any).shippingState ?? '').toLowerCase();
      const isIntra = state === HOME_STATE;

      (o.cart ?? []).forEach((item: any) => {
        const lineTotal = Number(item.lineTotal ?? 0);
        const taxable   = lineTotal / 1.05;
        const gst       = lineTotal - taxable;
        const cgst      = isIntra ? gst / 2 : 0;
        const sgst      = isIntra ? gst / 2 : 0;
        const igst      = isIntra ? 0 : gst;

        rows.push([
          GSTIN,
          o.id,
          date,
          o.customerName ?? '',
          (o as any).shippingState ?? '',
          item.hsn ?? item.hsnCode ?? '6211',
          item.name,
          item.quantity,
          +taxable.toFixed(2),
          5,
          +cgst.toFixed(2),
          +sgst.toFixed(2),
          +igst.toFixed(2),
          +lineTotal.toFixed(2),
        ]);
      });
    });

  // Summary row
  const sumTaxable = rows.reduce((s, r) => s + (r[8] as number), 0);
  const sumCGST    = rows.reduce((s, r) => s + (r[10] as number), 0);
  const sumSGST    = rows.reduce((s, r) => s + (r[11] as number), 0);
  const sumIGST    = rows.reduce((s, r) => s + (r[12] as number), 0);
  const sumInv     = rows.reduce((s, r) => s + (r[13] as number), 0);
  rows.push(['','','','','','','TOTAL','',+sumTaxable.toFixed(2),'',+sumCGST.toFixed(2),+sumSGST.toFixed(2),+sumIGST.toFixed(2),+sumInv.toFixed(2)]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 16 },
    { wch: 10 }, { wch: 40 }, { wch: 8  }, { wch: 16 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-1');
  download(wb, `GSTR1_${from}_to_${to}.xlsx`);
}

// ── SALES SUMMARY EXCEL ───────────────────────────────────────────────────────

export function exportSalesExcel(orders: Order[], from: string, to: string) {
  // Sheet 1: Order-level summary
  const ordHdr = ['Order ID','Date','Customer','Phone','City','State','Subtotal','Shipping','COD Fee','Total','Method','Status'];
  const ordRows = orders.map(o => [
    o.id,
    fmtDate(o.placedAt as any ?? o.createdAt as any),
    o.customerName ?? '',
    o.customerPhone ?? '',
    (o as any).shippingCity  ?? '',
    (o as any).shippingState ?? '',
    +Number(o.subtotal).toFixed(2),
    +Number(o.shippingCost).toFixed(2),
    +Number(o.codFee).toFixed(2),
    +Number(o.total).toFixed(2),
    o.method,
    o.status,
  ]);

  // Summary row
  const totSub  = ordRows.reduce((s, r) => s + (r[6]  as number), 0);
  const totShip = ordRows.reduce((s, r) => s + (r[7]  as number), 0);
  const totCod  = ordRows.reduce((s, r) => s + (r[8]  as number), 0);
  const totTot  = ordRows.reduce((s, r) => s + (r[9]  as number), 0);
  ordRows.push(['','','','','','TOTAL',+totSub.toFixed(2),+totShip.toFixed(2),+totCod.toFixed(2),+totTot.toFixed(2),'','']);

  const ws1 = XLSX.utils.aoa_to_sheet([ordHdr, ...ordRows]);
  ws1['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
  ];

  // Sheet 2: Status breakdown
  const statusMap: Record<string, { count: number; total: number }> = {};
  orders.forEach(o => {
    const s = o.status;
    if (!statusMap[s]) statusMap[s] = { count: 0, total: 0 };
    statusMap[s].count++;
    statusMap[s].total += Number(o.total);
  });
  const stHdr = ['Status','Order Count','Total Revenue (₹)'];
  const stRows = Object.entries(statusMap).map(([st, v]) => [st, v.count, +v.total.toFixed(2)]);
  stRows.push(['TOTAL', orders.length, +totTot.toFixed(2)]);

  const ws2 = XLSX.utils.aoa_to_sheet([stHdr, ...stRows]);
  ws2['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }];

  // Sheet 3: SKU-wise sales
  const skuMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders
    .filter(o => !['Cancelled','Return'].includes(o.status))
    .forEach(o => {
      (o.cart ?? []).forEach((item: any) => {
        const key = item.sku ?? item.name;
        if (!skuMap[key]) skuMap[key] = { name: item.name, qty: 0, revenue: 0 };
        skuMap[key].qty     += Number(item.quantity ?? 1);
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
  XLSX.utils.book_append_sheet(wb, ws1, 'All Orders');
  XLSX.utils.book_append_sheet(wb, ws2, 'Status Summary');
  XLSX.utils.book_append_sheet(wb, ws3, 'SKU Sales');
  download(wb, `MFH_Sales_${from}_to_${to}.xlsx`);
}
