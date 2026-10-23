import type { Order } from '@/types';
import { LABEL_LOGO } from './labelLogo';
import { invoiceDateOf } from './price';
import { taxHeads, taxHeadLabel } from './gst';

// Shared 4x6 "TAX INVOICE / SHIPPING LABEL" generator — used by BOTH the admin
// orders page and the customer orders page (so the customer invoice is IDENTICAL
// to the label the admin downloads). Pure functions of the order object.

  // Shared 4x6 label styles (one label per printed page)
export const LABEL_CSS = `
      *{box-sizing:border-box}
      /* The 5mm gutter lives HERE, not on the body.
         Body padding applies once to the whole document, not to each sheet,
         so the first label got its gutter and every label after it started
         hard against the top edge of the sticker - where a thermal head does
         not print, taking the top of the logo with it. On @page it is applied
         to every sheet. Measured in headless Chromium across three labels:
         frame top 14.2pt on all of them, whether the print dialog uses the
         CSS page size or forces zero margins. */
      @page{size:4in 6in;margin:5mm}
      html,body{margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
      /* Only so the preview window does not look glued to the glass; paper
         takes its gutter from @page above. */
      @media screen{body{padding:5mm}}
      /* Every sticker is the same sticker.
         .label had no height, so it was only as tall as its contents: a
         two-item order filled the 4x6 label and a one-item order stopped
         two-thirds of the way down, leaving bare sticker below the border and
         a different-looking parcel each time. min-height (not height) fills
         the label without ever cutting a line off a long order, and the
         column layout lets the footer sit at the bottom edge where it
         belongs instead of floating under the last row. */
      .label{margin:0;border:1px solid #111;padding:10px 8px 6px 8px;page-break-after:always;
             min-height:calc(6in - 10mm);display:flex;flex-direction:column}
      .label:last-child{page-break-after:auto}
      .top{position:relative;text-align:center;padding-top:2px}
      .brand-logo{width:135px;height:auto;object-fit:contain;display:inline-block}
      .web{font-size:12px;color:#a7354d;font-weight:700;margin-top:0}
      .courier-mini{position:absolute;top:0;right:0;color:#111;font-weight:800;font-size:11px;letter-spacing:.03em;white-space:nowrap}
      .taxinv{position:absolute;top:0;left:0;font-size:8px;font-weight:800;color:#111}
      .box{border:1px solid #111;padding:4px 6px;margin-top:-1px}
      .lbl{font-size:7px;font-weight:700;letter-spacing:.06em;color:#333}
      /* The spare room on a short order goes INSIDE the products frame,
         where a longer order would have used it anyway. Left to collect at
         the bottom instead, a one-item label showed a bare white band
         between the seller box and the footer that read like something had
         failed to print. */
      .box.grow{flex:1 1 auto}
      .cols{display:flex;gap:0;margin-top:-1px}.cols>.box{flex:1;margin-top:0}.cols>.box+.box{margin-left:-1px}
      .awbnum{font-size:12px;font-weight:800;letter-spacing:.08em;text-align:center;margin-top:1px}
      .codewrap{display:flex;align-items:stretch;gap:6px;margin-top:3px}
      .bcbox{flex:1;min-width:0;border:1px solid #111;padding:3px 2px;display:flex;flex-direction:column;justify-content:center}
      .qrbox{border:1px solid #111;padding:2px;display:flex;align-items:center;justify-content:center}
      .bc{display:block;width:75%;height:30px;margin:0 auto}
      /* The order-id barcode under the ORDER ID box. Shorter than the AWB one
         above it so the two are told apart at a glance on the bag, and so the
         label still fits the same sticker. */
      .bc-sm{display:block;width:92%;height:16px;margin:2px auto 0}
      .qr{width:58px;height:58px;flex-shrink:0;display:block}
      .to{font-size:11px;font-weight:800;margin:1px 0}
      .txt{font-size:8px}
      .big{font-weight:800;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:8px}
      th{text-align:left;font-size:7px;letter-spacing:.03em;color:#333;border-bottom:1px solid #999;padding-bottom:2px}
      .tax{display:flex;gap:8px}.tax .left{flex:1.3}.tax .right{flex:1}
      .taxrow{display:flex;justify-content:space-between;font-size:8px;padding:0}
      .taxrow.total{font-weight:800;border-top:1px solid #999;margin-top:2px;padding-top:2px}
      .foot{font-size:9.5px;font-weight:700;margin-top:5px;text-align:center}
      /* margin-top:auto eats whatever space is left, so the app line and the
         note below it are pinned to the bottom of the sticker on every
         label, whether the order had one item or four. */
      .applink{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:auto;padding-top:5px}
      .appname{font-size:9px;font-weight:800;letter-spacing:.01em}
      .foot .muted{font-weight:400;color:#555}
      @media print{body{margin:0;padding:0}.label{border:1px solid #111}}`;

export interface LabelOptions {
  /**
   * Print a barcode of OUR order id under the ORDER ID box.
   *
   * The label has always carried a barcode, and it encodes the AWB whenever
   * there is one - which is right for the courier and no use at all to the
   * person filling the thaili, who needs to find the ORDER. Scanning the bag
   * then meant reading the order id off the label by eye and typing it.
   *
   * Optional because not every parcel is picked that way, and a label that is
   * already full should not grow for a shop that will not use it.
   */
  orderBarcode?: boolean;
}

export const buildLabelBody = (order: Order, opts: LabelOptions = {}): string => {
    const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const money = (n: number) => 'Rs.' + Number(n || 0).toFixed(2);
    const awb = order.awb || '';
    // Both the barcode AND the QR encode this same value — the AWB number when the order
    // has one (falls back to the order id only for orders that don't have an AWB yet, so the
    // code is never blank). Print labels after assigning the AWB and both carry the AWB.
    const codeVal = awb || order.id;

    // Only when asked for, and never twice. With no AWB yet, the big barcode
    // at the top of the label IS the order id already - printing a second,
    // identical one underneath helps nobody and gives a scanner two things to
    // pick between.
    const wantsOrderBarcode = opts.orderBarcode === true && codeVal !== order.id;
    const orderBarcode = wantsOrderBarcode
      ? `<svg class="bc bc-sm" data-code="${esc(order.id)}"></svg>`
      : '';
    const courier = (order.courier || '').trim();
    const showCourier = !!awb && !!courier;
    const gstRate = Number(order.cart[0]?.gstRate) || 5;
    const hsn = order.cart[0]?.hsn || '6211';
    const invoiceTotal = Number(order.total) || 0;
    const taxable = invoiceTotal / (1 + gstRate / 100);
    const totalTax = invoiceTotal - taxable;
    // CGST + SGST inside Rajasthan, IGST everywhere else. The label printed
    // the local heads on every parcel, which is wrong on every interstate
    // sale - and almost every sale is interstate.
    const heads = taxHeads(totalTax, order.shippingState);
    const totalQty = order.cart.reduce((s, i) => s + i.quantity, 0);
    const isCod = (order.method || '').toLowerCase() === 'cod';
    // Money already settled before delivery: paid online as a COD advance, or from
    // the wallet. The delivery agent must collect only what is left.
    const advancePaid = Number(order.advancePaid) || 0;
    const walletUsed = Number(order.walletUsed) || 0;
    const prepaidPart = advancePaid + walletUsed;
    const codCollect = Math.max(0, invoiceTotal - prepaidPart);
    // What the delivery agent has to do, in one line. The amount is already
    // net of anything paid online, so the old second and third lines - PART
    // PAID, and a note saying how much NOT to collect - were explaining a
    // subtraction that had already been done, on a box that gets read in a
    // second while a parcel is being taped.
    const payment = isCod ? `COD Collect ${money(codCollect)}` : 'Prepaid';
    // The invoice's own date, not the order's — see invoiceDateOf.
    const placed = invoiceDateOf(order).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
        <img class="brand-logo" src="${LABEL_LOGO}" alt="Mahalaxmi Fashion Hub" />
        <div class="web">www.mahalaxmifashionhub.com</div>
      </div>
      <div class="box" style="margin-top:3px">
        <div class="lbl">AWB / TRACKING ID</div>
        <div class="codewrap">
          <div class="bcbox">
            <svg class="bc" data-code="${esc(codeVal)}"></svg>
            <div class="awbnum">${esc(awb || 'PENDING')}</div>
          </div>
          <div class="qrbox">
            <img class="qr" alt="QR" onerror="this.style.display='none'"
              src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent(codeVal)}" />
          </div>
        </div>
      </div>
      <div class="cols">
        <div class="box"><div class="lbl">ORDER ID</div><div class="big">${esc(order.id)}</div>${orderBarcode}</div>
        <div class="box"><div class="lbl">PAYMENT</div><div class="big">${esc(payment)}</div></div>
      </div>
      <div class="box">
        <div><span class="lbl">CUSTOMER ADDRESS:</span> <span class="to">${esc(order.shippingName || order.customerName || '')}</span></div>
        <div class="txt">${shipTo}</div>
      </div>
      <div class="box grow">
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
          <div class="txt">HSN: ${esc(hsn)} | GST: ${gstRate}% | ${taxHeadLabel(order.shippingState)}</div>
        </div>
        <div class="right">
          <div class="taxrow"><span>Taxable Value</span><span>${money(taxable)}</span></div>
          ${heads.intra ? `
          <div class="taxrow"><span>CGST</span><span>${money(heads.cgst)}</span></div>
          <div class="taxrow"><span>SGST</span><span>${money(heads.sgst)}</span></div>` : `
          <div class="taxrow"><span>IGST</span><span>${money(heads.igst)}</span></div>`}
          <div class="taxrow total"><span>Invoice Total</span><span>${money(invoiceTotal)}</span></div>
          ${isCod && prepaidPart > 0 ? `
          ${advancePaid > 0 ? `<div class="taxrow"><span>Advance paid online</span><span>- ${money(advancePaid)}</span></div>` : ''}
          ${walletUsed > 0 ? `<div class="taxrow"><span>Paid from wallet</span><span>- ${money(walletUsed)}</span></div>` : ''}
          <div class="taxrow total" style="color:#a7354d"><span>COD Collect</span><span>${money(codCollect)}</span></div>` : ''}
        </div>
      </div>
      <div class="cols">
        <div class="box"><div class="lbl">SELLER / PICKUP</div><div class="txt">Mahalaxmi Fashion Hub, Balotra, Rajasthan - 344022</div></div>
        <div class="box"><div class="lbl">DELIVERY PARTNER</div><div class="txt">${showCourier ? esc(courier) + ' | ' : ''}AWB: ${esc(awb || 'PENDING')}</div></div>
      </div>
      <div class="applink">
        <span class="appname">Google Play Store &middot; Mahalaxmi Online Shopping</span>
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

// Open the print dialog only once every picture on the page has finished -- or
// given up. The old code waited a flat 350ms and printed whatever had arrived
// by then, which on a slow connection meant a label with a blank header or a
// half-drawn QR, and nobody notices until the parcel is already taped.
//
// The 4 second cap matters as much as the wait: a label with a missing QR is
// worth printing, a print dialog that never opens is not.
function printWhenReady(){
  var imgs = Array.prototype.slice.call(document.images);
  var left = 0, done = false;
  function go(){ if(done){return;} done = true; window.focus(); window.print(); }
  for (var i = 0; i < imgs.length; i++) {
    var im = imgs[i];
    if (im.complete) { continue; }
    left++;
    var settle = function(){ if(--left <= 0){ setTimeout(go, 120); } };
    im.addEventListener("load", settle);
    im.addEventListener("error", settle);
  }
  if (left === 0) { setTimeout(go, 120); }
  setTimeout(go, 4000);
}
`;

/**
 * What the saved PDF is called.
 *
 * The browser takes the document title for the Save-as-PDF name, and the title
 * was "Labels (1)" - so every label anyone ever saved was Labels_1.pdf, then
 * Labels_1(1).pdf, and a folder of them told you nothing about which order was
 * which. One order is named after that order. A batch is named by the moment
 * it was printed, because a batch has no single order to be named after.
 * MFH stays at the front either way, and the order id already begins with it.
 */
export const labelFileName = (list: Order[], now: Date = new Date()): string => {
  if (list.length === 1) {
    const id = String(list[0]?.id ?? '').trim();
    if (id) return /^MFH/i.test(id) ? id : `MFH-${id}`;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `MFH-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
       + `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
};

export const openOrderLabels = (list: Order[], opts: LabelOptions = {}) => {
    if (!list.length) return;
    // o => buildLabelBody(o, opts), NOT list.map(buildLabelBody): map hands its
    // callback (value, index, array), so passing the function by name would
    // have delivered the array INDEX as the options object. It would not have
    // thrown - a number simply has no orderBarcode property - it would just
    // have silently never printed the barcode.
    const bodies = list.map(o => buildLabelBody(o, opts)).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${labelFileName(list)}</title>
    <style>${LABEL_CSS}</style>
    <script>${BARCODE_JS}</script></head>
    <body onload="try{document.querySelectorAll('.bc').forEach(drawBarcode);}catch(e){};printWhenReady();">
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
