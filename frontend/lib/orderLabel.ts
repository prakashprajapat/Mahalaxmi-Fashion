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
      .label{width:4in;min-height:6in;margin:0 auto;border:1px solid #111;padding:7px 8px;page-break-after:always}
      .label:last-child{page-break-after:auto}
      .top{position:relative;text-align:center;padding-top:2px}
      .brand-logo{width:135px;height:auto;object-fit:contain;display:inline-block}
      .web{font-size:9px;color:#a7354d;font-weight:700;margin-top:0}
      .courier-mini{position:absolute;top:0;right:0;background:#111;color:#fff;font-weight:800;font-size:7px;padding:2px 5px;border-radius:3px;letter-spacing:.03em;white-space:nowrap}
      .doctitle{font-size:10px;font-weight:800;margin:3px 0 4px;text-align:center}
      .box{border:1px solid #111;padding:4px 6px;margin-top:5px}
      .lbl{font-size:7px;font-weight:700;letter-spacing:.06em;color:#333}
      .cols{display:flex;gap:5px}.cols>.box{flex:1;margin-top:0}
      .awbnum{font-size:12px;font-weight:800;letter-spacing:.08em;text-align:center;margin-top:1px}
      .bc{display:block;width:100%;height:34px}
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
    const payment = (order.method || '').toLowerCase() === 'cod' ? 'COD' : (order.method || 'PREPAID').toUpperCase();
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
        ${showCourier ? `<div class="courier-mini">${esc(courier.toUpperCase())}</div>` : ''}
        <img class="brand-logo" src="https://mahalaxmifashionhub.com/email-logo.png" alt="logo" />
        <div class="web">www.mahalaxmifashionhub.com</div>
      </div>
      <div class="doctitle">TAX INVOICE / ${showCourier ? esc(courier.toUpperCase()) + ' ' : ''}SHIPPING LABEL</div>
      <div class="box">
        <div class="lbl">AWB / TRACKING ID</div>
        <svg class="bc" data-code="${esc(awb || order.id)}"></svg>
        <div class="awbnum">${esc(awb || 'PENDING')}</div>
      </div>
      <div class="cols" style="margin-top:5px">
        <div class="box"><div class="lbl">ORDER ID</div><div class="big">${esc(order.id)}</div></div>
        <div class="box"><div class="lbl">PAYMENT</div><div class="big">${esc(payment)}</div></div>
      </div>
      <div class="box">
        <div class="lbl">SHIP TO</div>
        <div class="to">${esc(order.shippingName || order.customerName || '')}</div>
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
          <div class="taxrow total"><span>Total Tax</span><span>${money(totalTax)}</span></div>
          <div class="taxrow total"><span>Invoice Total</span><span>${money(invoiceTotal)}</span></div>
        </div>
      </div>
      <div class="cols" style="margin-top:5px">
        <div class="box"><div class="lbl">SELLER / PICKUP</div><div class="txt">Mahalaxmi Fashion Hub, Balotra, Rajasthan - 344022</div></div>
        <div class="box"><div class="lbl">DELIVERY PARTNER</div><div class="txt">${showCourier ? esc(courier) + ' | ' : ''}AWB: ${esc(awb || 'PENDING')}</div></div>
      </div>
      <div class="foot">Print this label and paste it on the parcel before handover.
        <span class="muted">Tax included in invoice total.</span></div>
    </div>`;
  };

  // Opens one or many labels in a print view; the print dialog lets you "Save as PDF"
  // (or send straight to a 4x6 label printer). Each label is its own page.
export const openOrderLabels = (list: Order[]) => {
    if (!list.length) return;
    const bodies = list.map(buildLabelBody).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels (${list.length})</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>${LABEL_CSS}</style></head>
    <body onload="try{document.querySelectorAll('.bc').forEach(function(el){JsBarcode(el, el.getAttribute('data-code'), {format:'CODE128',displayValue:false,height:30,margin:0,width:1.4});});}catch(e){};setTimeout(function(){window.focus();window.print();},450);">
    ${bodies}
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { alert('Please allow pop-ups for this site to download/print labels.'); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

