import type { Order } from '@/types';

// Shared 4x6 "TAX INVOICE / SHIPPING LABEL" generator — used by BOTH the admin
// orders page and the customer orders page (so the customer invoice is IDENTICAL
// to the label the admin downloads). Pure functions of the order object.

  // Shared 4x6 label styles (one label per printed page)
export const LABEL_CSS = `
      *{box-sizing:border-box}
      @page{size:4in 6in;margin:0}
      html,body{margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
      .label{width:4in;min-height:6in;margin:0 auto;border:1px solid #111;padding:22px 8px 7px 8px;page-break-after:always}
      .label:last-child{page-break-after:auto}
      .top{position:relative;text-align:center;padding-top:2px}
      .brand-logo{width:135px;height:auto;object-fit:contain;display:inline-block}
      .web{font-size:12px;color:#a7354d;font-weight:700;margin-top:0}
      .courier-mini{position:absolute;top:0;right:0;background:#111;color:#fff;font-weight:800;font-size:7px;padding:2px 5px;border-radius:3px;letter-spacing:.03em;white-space:nowrap}
      .taxinv{position:absolute;top:0;left:0;font-size:8px;font-weight:800;color:#111}
      .box{border:1px solid #111;padding:4px 6px;margin-top:5px}
      .lbl{font-size:7px;font-weight:700;letter-spacing:.06em;color:#333}
      .cols{display:flex;gap:5px}.cols>.box{flex:1;margin-top:0}
      .awbnum{font-size:12px;font-weight:800;letter-spacing:.08em;text-align:center;margin-top:1px}
      .bc{display:block;width:100%;height:26px}
      .qr{width:58px;height:58px;flex-shrink:0;display:block}
      .to{font-size:11px;font-weight:800;margin:1px 0}
      .txt{font-size:8px}
      .big{font-weight:800;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:8px}
      th{text-align:left;font-size:7px;letter-spacing:.03em;color:#333;border-bottom:1px solid #999;padding-bottom:2px}
      .tax{display:flex;gap:8px}.tax .left{flex:1.3}.tax .right{flex:1}
      .taxrow{display:flex;justify-content:space-between;font-size:8px;padding:0}
      .taxrow.total{font-weight:800;border-top:1px solid #999;margin-top:2px;padding-top:2px}
      .foot{font-size:7px;font-weight:700;margin-top:5px}
      .foot .muted{font-weight:400;color:#555}
      @media print{body{margin:0}.label{margin:0;width:4in;border:1px solid #111}}`;

export const buildLabelBody = (order: Order): string => {
    const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const money = (n: number) => 'Rs.' + Number(n || 0).toFixed(2);
    const awb = order.awb || '';
    const courier = (order.courier || '').trim();
    const showCourier = !!awb && !!courier;
    const gstRate = Number(order.cart[0]?.gstRate) || 5;
    const hsn = order.cart[0]?.hsn || '6211';
    const invoiceTotal = Number(order.total) || 0;
    const taxable = invoiceTotal / (1 + gstRate / 100);
    const totalTax = invoiceTotal - taxable;
    const cgst = totalTax / 2;
    const totalQty = order.cart.reduce((s, i) => s + i.quantity, 0);
    const payment = (order.method || '').toLowerCase() === 'cod' ? 'COD' : 'Prepaid';
    const placed = new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const shipTo = [order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).map(esc).join(', ');
    const productRows = order.cart.map((it, i) => `
      <tr>
        <td style="padding:4px 0">${i + 1}. ${esc(it.name)}</td>
        <td>${esc(it.sku || '-')}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td>${esc(it.size || '-')}</td>
        <td style="text-align:right">${money(it.lineTotal)}</td>
      </tr>`).join('');
    return `
    <div class="label">
      <div class="top">
        <div class="taxinv">Tax Invoice</div>
        ${showCourier ? `<div class="courier-mini">${esc(courier.toUpperCase())}</div>` : ''}
        <img class="brand-logo" src="https://mahalaxmifashionhub.com/email-logo.png" alt="logo" />
        <div class="web">www.mahalaxmifashionhub.com</div>
      </div>
      <div class="box">
        <div class="lbl" style="margin-bottom:4px">AWB / TRACKING ID</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;min-width:0">
            <svg class="bc" data-code="${esc(awb || order.id)}"></svg>
            <div class="awbnum">${esc(awb || 'PENDING')}</div>
          </div>
          <img class="qr" alt="QR" onerror="this.style.display='none'"
            src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent(awb || order.id)}" />
        </div>
      </div>
      <div class="cols" style="margin-top:5px">
        <div class="box"><div class="lbl">ORDER ID</div><div class="big">${esc(order.id)}</div></div>
        <div class="box"><div class="lbl">PAYMENT</div><div class="big">${esc(payment)}</div></div>
      </div>
      <div class="box">
        <div><span class="lbl">SHIP TO:</span> <span class="to">${esc(order.shippingName || order.customerName || '')}</span></div>
        <div class="txt">${shipTo}</div>
      </div>
      <div class="box">
        <div class="lbl" style="margin-bottom:3px">PRODUCT DETAILS (TOTAL QTY: ${totalQty})</div>
        <table>
          <tr><th>Product</th><th>SKU</th><th style="text-align:center">Qty</th><th>Size</th><th style="text-align:right">Amount</th></tr>
          ${productRows}
        </table>
      </div>
      <div class="box tax">
        <div class="left">
          <div class="lbl">TAX INVOICE</div>
          <div style="font-weight:800;font-size:9px;margin:1px 0">Invoice Type: Tax Invoice</div>
          <div class="txt">Invoice No: ${esc(order.invoiceNumber || 'Pending (mark Ready to Ship)')}</div>
          <div class="txt">Invoice Date: ${placed}</div>
          <div class="txt">HSN: ${esc(hsn)} | GST: ${gstRate}% | CGST + SGST</div>
        </div>
        <div class="right">
          <div class="taxrow"><span>Taxable Value</span><span>${money(taxable)}</span></div>
          <div class="taxrow"><span>CGST</span><span>${money(cgst)}</span></div>
          <div class="taxrow"><span>SGST</span><span>${money(cgst)}</span></div>
          <div class="taxrow total"><span>Invoice Total</span><span>${money(invoiceTotal)}</span></div>
        </div>
      </div>
      <div class="cols" style="margin-top:5px">
        <div class="box"><div class="lbl">SELLER / PICKUP</div><div class="txt">Mahalaxmi Fashion Hub, Balotra, Rajasthan - 344022</div></div>
        <div class="box"><div class="lbl">DELIVERY PARTNER</div><div class="txt">${showCourier ? esc(courier) + ' | ' : ''}AWB: ${esc(awb || 'PENDING')}</div></div>
      </div>
      <div class="foot">Note: Please record a clear video before opening the parcel.</div>
    </div>`;
  };

  // Opens one or many labels in a print view; the print dialog lets you "Save as PDF"
  // (or send straight to a 4x6 label printer). Each label is its own page.
// Self-contained CODE128-B barcode -> SVG. No external CDN, so barcodes ALWAYS
// render in the print/popup window (the CDN <script> was being blocked in the
// blob-URL print window, which is why barcodes had disappeared).
const BARCODE_JS = `
var C128=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
function c128b(t){var codes=[104],s=104,i;for(i=0;i<t.length;i++){codes.push(t.charCodeAt(i)-32);}for(i=0;i<t.length;i++){s+=(t.charCodeAt(i)-32)*(i+1);}codes.push(s%103);codes.push(106);var b="";for(i=0;i<codes.length;i++){b+=C128[codes[i]];}return b;}
function drawBarcode(svg){var code=(svg.getAttribute("data-code")||"").replace(/[^ -~]/g,"");if(!code){return;}var w=c128b(code),total=0,i;for(i=0;i<w.length;i++){total+=+w[i];}var H=40,x=0,r="";for(i=0;i<w.length;i++){var ww=+w[i];if(i%2===0){r+="<rect x='"+x+"' y='0' width='"+ww+"' height='"+H+"'></rect>";}x+=ww;}svg.setAttribute("viewBox","0 0 "+total+" "+H);svg.setAttribute("preserveAspectRatio","none");svg.setAttribute("fill","#000");svg.innerHTML=r;}
`;

export const openOrderLabels = (list: Order[]) => {
    if (!list.length) return;
    const bodies = list.map(buildLabelBody).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels (${list.length})</title>
    <style>${LABEL_CSS}</style>
    <script>${BARCODE_JS}</script></head>
    <body onload="try{document.querySelectorAll('.bc').forEach(drawBarcode);}catch(e){};setTimeout(function(){window.focus();window.print();},350);">
    ${bodies}
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { alert('Please allow pop-ups for this site to download/print labels.'); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };


// Combined "Picklist / Manifest" for a set of orders (e.g. all Ready-to-Ship).
// Aggregates every line item by SKU + Colour + Size and sums the quantity, then
// opens a printable A4 sheet (Save as PDF). Matches the supplier picklist format.
export const openPicklist = (list: Order[], supplierName = 'MAHALAXMI FASHION POINT.') => {
    if (!list.length) { alert('No orders to build a picklist from.'); return; }
    const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const map = new Map<string, { sku: string; color: string; size: string; qty: number }>();
    for (const o of list) {
      for (const it of o.cart) {
        const sku = (it.sku || '-').trim() || '-';
        const color = (it.color || '').trim() || 'Multicolor';
        let size = (it.size || '').trim();
        if (size.includes('/')) size = size.split('/')[0].trim();   // strip colour if size held "M / Red"
        if (!size) size = 'Free Size';
        const key = sku + '||' + color + '||' + size;
        const cur = map.get(key);
        if (cur) cur.qty += it.quantity;
        else map.set(key, { sku, color, size, qty: it.quantity });
      }
    }
    const items = Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku) || a.size.localeCompare(b.size));
    const totalUnits = items.reduce((s, r) => s + r.qty, 0);
    const rows = items.map(r => `<tr><td>${esc(r.sku)}</td><td>${esc(r.color)}</td><td>${esc(r.size)}</td><td class="q">${r.qty}</td></tr>`).join('');
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Picklist</title>
    <style>
      *{box-sizing:border-box}@page{size:A4;margin:12mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:18px}
      h1{font-size:26px;margin:0 0 12px}
      .meta{font-size:14px;font-weight:700;margin:3px 0}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th,td{border:1px solid #111;padding:9px 10px;font-size:13px;text-align:center}
      th{background:#efefef;font-weight:700}
      td.q{font-weight:800}
      tfoot td{font-weight:800;background:#faf6ee}
      .foot{text-align:center;font-size:11px;color:#666;margin-top:16px}
      @media print{body{padding:0}}
    </style></head>
    <body onload="setTimeout(function(){window.focus();window.print();},300);">
      <h1>Picklist</h1>
      <div class="meta">Supplier Name : ${esc(supplierName)}</div>
      <div class="meta">Date : ${date}</div>
      <table>
        <thead><tr><th>SKU</th><th>Color</th><th>Size</th><th>Total Quantity</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right">Total Units</td><td>${totalUnits}</td></tr></tfoot>
      </table>
      <div class="foot">${list.length} order(s) &middot; ${items.length} unique lines &middot; Mahalaxmi Fashion Hub</div>
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { alert('Please allow pop-ups to open the picklist.'); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
