# Google pe Products Dikhane + Remarketing + Reconcile Guide

## Sach baat pehle
"nighty" jaise generic keyword pe Amazon/Flipkart/Meesho se organic me upar aana months lagenge (unki domain authority bahut zyada hai). **Lekin** jo "Popular products" carousel tumne screenshot me dekha — wahan tumhare products **FREE me** aa sakte hain Google Merchant Center se. Wahi sabse pehla kaam hai.

## Step 1: Google Merchant Center (sabse important — FREE)
1. Check karo account hai ya nahi: https://merchants.google.com pe apne Google account se login karo. Dashboard khule to account hai; "Get started" aaye to naya banao.
2. Business details bharo, website verify karo (Search Console se linked ho to auto-verify).
3. **Products → Feeds → Add feed → Scheduled fetch**:
   - Feed URL: `https://mahalaxmifashionhub.com/feed/google-merchant.xml`
   - Fetch frequency: Daily
   (Ye feed ab code me ready hai — deploy ke baad live hoga)
4. "Free listings" enable karo (Growth → Manage programs).
5. 3-5 din me products review hoke Google Shopping tab + "Popular products" me aane lagenge.
6. Rejected products aayen to Merchant Center me reason dikhega (aksar image quality ya missing shipping info). Shipping settings me flat ₹60 / free above ₹999 set kar dena.

## Step 2: Google Search Console
1. https://search.google.com/search-console → property `mahalaxmifashionhub.com` add/verify karo.
2. Sitemaps → `https://mahalaxmifashionhub.com/sitemap.xml` submit karo.
   (Ab sitemap me saare product URLs bhi hain — pehle sirf 19 static pages the!)
3. URL Inspection me apne top products daal ke "Request Indexing" karo.
4. 2-4 hafte me "site:mahalaxmifashionhub.com nighty" search karke check karo kitne pages index hue.

## Step 3: "Bar bar customer ke paas dikhna" = Remarketing (PAID)
Jo visitors website pe aake bina kharide chale jaate hain, unko wapas laane ke liye:
1. **Google Ads** account banao → GA4 se link karo (view_item events already fire ho rahe hain — audience ready milegi).
2. **Performance Max campaign** banao Merchant Center feed se — yehi Amazon/Meesho jaisa "har jagah dikhna" deta hai (Search + Shopping + YouTube + Gmail + Display).
3. Budget: ₹300-500/din se shuru karke 2 hafte data dekho. Fashion me ROAS 3-4x realistic hai.
4. **Meta (FB/Instagram) remarketing** bhi fashion ke liye strong hai — Meta Pixel lagana hoga (abhi site pe nahi hai; bolo to laga dunga).

## Step 4: Organic SEO (lambi race)
- Category pages (/nighty, /saree, /petticoat) pe 200-300 words ka unique content + FAQ section daalo ("cotton nighty online", "nighty for women under 500" jaise keywords).
- Product names descriptive rakho: "Pure Cotton Printed Nighty for Women — Full Length" (sirf "Nighty #123" nahi).
- Reviews collect karte raho — star ratings search results me dikhte hain (schema already laga hai).

## Payment Reconciliation (ab live hai)
**Admin panel**: Admin → 💰 Payment Reconcile → date range → Reconcile → Excel Export
- ✅ Matched = payment aur order dono sahi
- ⚠️ Amount Mismatch = payment aur order ki value alag — check karo
- ❌ Payment mila, Order nahi = paisa aaya par order create nahi hua (customer ko manually order banake do!)
- ❌ Order hai, Payment nahi = order bana par paisa nahi aaya

**Script (cron ke liye)**: `reconcile_payments.py` — har mahine auto Excel:
```bash
pip install requests openpyxl
export MFH_ADMIN_EMAIL='admin@mahalaxmifashionhub.com'
export MFH_ADMIN_PASSWORD='<password>'
python3 reconcile_payments.py --last-month
```

## Deploy ke baad verify
1. `https://mahalaxmifashionhub.com/feed/google-merchant.xml` kholo — products ka XML dikhna chahiye
2. `https://mahalaxmifashionhub.com/sitemap.xml` — product URLs dikhne chahiye
3. Admin → Payment Reconcile — pichhle 30 din chala ke dekho
4. (Console me jo 503 sw.js error tha — wo pending deploy me hi fix hai)
