# Mahalaxmi Fashion Hub - Website Audit Report

Audit date: 2026-07-06 IST  
Scope: Next.js frontend, .NET 8 API, PostgreSQL schema, deployment scripts, and live header checks for `mahalaxmifashionhub.com`.

## Verification Summary

| Check | Result |
|---|---|
| Backend compile | Working - `dotnet build backend\MahalaxmiApi.csproj --nologo` passed with 0 warnings / 0 errors |
| Frontend production build | Working - `pnpm run build` passed |
| Frontend lint | Working with warnings - no errors after fixes; warnings remain for `<img>` optimization, a11y combobox attrs, and hook deps |
| HTTPS live | Working - `https://mahalaxmifashionhub.com` returns 200 via Cloudflare |
| HTTP to HTTPS | Working - `http://mahalaxmifashionhub.com` returns 301 to HTTPS |
| www redirect | Fixed in code, pending deploy - live `https://www.mahalaxmifashionhub.com` was returning 200 instead of 301 |
| robots/sitemap live | Working, but improved - live robots and sitemap return 200; private routes were added to robots blocklist |
| GA/GTM | GA4 is present and lazy-loaded; GTM container not present |

## Fixes Applied

| Area | Fix |
|---|---|
| Security headers | Added frontend `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; disabled `X-Powered-By` |
| SEO redirect | Added host redirect from `www.mahalaxmifashionhub.com` to non-www canonical domain |
| 404 image | Fixed broken `/Logo.png` reference to `/logo.webp?v=4` |
| robots.txt | Blocked `/account`, `/cart`, `/checkout`, `/orders`, `/wishlist`, `/admin`, `/api` |
| Lint setup | Added `frontend/.eslintrc.json` so `next lint` does not prompt interactively |
| JSX lint errors | Escaped apostrophes in welcome popup |
| Backend warnings | Fixed nullable SKU handling in order total recomputation |
| Dependency reproducibility | Generated `frontend/pnpm-lock.yaml` during dependency install |

## Working / Implemented

| Checklist Area | Status |
|---|---|
| Basic website open/HTTPS | Working live |
| Homepage build/render | Working in production build |
| Mobile/desktop responsive CSS | Partially implemented through responsive CSS/media queries; real-device testing still pending |
| Product listing/detail | Implemented |
| Product price/discount display | Implemented via `finalUnitPrice`, discount price, MRP display |
| Out of stock add-to-cart block | Implemented for stock status and variant stock display |
| Cart persistence | Implemented via localStorage |
| Quantity update/remove/cart total | Implemented |
| Checkout required fields | Implemented client-side; backend still needs stronger DTO validation |
| Pincode to state mapping | Implemented by prefix mapping |
| COD/online checkout UI | Implemented |
| Razorpay signature verification | Implemented |
| Razorpay webhook verification | Implemented |
| Duplicate order ID protection | Implemented through unique `order_id` and existing-order handling |
| Customer login/register/OTP/forgot password | Implemented |
| Admin login | Implemented with JWT and BCrypt |
| Admin products/orders/customers/settings/reports | Implemented |
| Staff/admin role policy | Implemented in backend |
| Coupons | Implemented with expiry, max use, min order, customer-specific occasion coupons |
| Reviews | Implemented with approval flow |
| Returns/cancel flow | Implemented with time windows and media upload |
| Delhivery reverse pickup | Implemented for returns |
| Email/SMTP service | Implemented, but deliverability/DNS not verified |
| MSG91 OTP service | Implemented, but live template/balance not verified |
| Sitemap/robots | Implemented |
| Global metadata/Open Graph/Twitter | Implemented |
| Product schema/breadcrumb schema | Implemented on product page client render |
| PWA manifest/service worker | Implemented basic PWA |
| DB indexes/unique order/payment IDs | Implemented |
| Security headers backend API | Implemented |
| Rate limiting for auth/OTP | Implemented |
| CORS allowed origins | Implemented |
| Secrets examples and `.gitignore` | Implemented; real production secrets not present in repo |

## High Priority Pending

| Priority | Issue | Why It Matters | Suggested Fix |
|---|---|---|---|
| P0 | Online payment can be captured without creating a customer-facing `site_order` if browser closes after Razorpay payment | Payment webhook marks `razorpay_orders` paid, but does not create/update `site_orders` | On webhook, create/update `site_orders` from stored cart/customer/shipping JSON, or make backend payment verification atomically place the order |
| P0 | Stock is not auto-deducted on order placement | Negative stock/overselling can happen, especially during concurrent checkout | Add transactional stock decrement per SKU/variant; reject when available qty is insufficient; restore stock on cancel/return |
| P0 | OTP/admin recovery can expose `devOtp` when delivery channels are not configured | In production, misconfiguration could reveal OTP on screen | Only return `devOtp` in Development; in Production return setup error and alert admin |
| P1 | Product detail SEO metadata is not server-generated | Product pages are client components; title/meta may remain generic for crawlers | Add server `generateMetadata`, slug-based URLs, and include products in sitemap |
| P1 | Live frontend security headers missing until deploy | Current live response showed no frontend security headers and exposed `X-Powered-By` | Deploy the applied Next config changes and re-test headers |
| P1 | Live www canonical redirect missing until deploy | Search engines can index duplicate www/non-www versions | Deploy applied host redirect or enforce at Cloudflare/nginx |
| P1 | Order confirmation email/SMS/customer/admin notification not wired in `OrdersController` | Customer/admin may not receive reliable order notification | Send transactional email/SMS/WhatsApp after order create and status changes |
| P1 | Forward shipping AWB generation not implemented | Delhivery reverse pickup exists, but forward dispatch appears manual | Add forward shipment API integration or document manual AWB process |
| P1 | Public product image upload validation is not full content validation | Extension/base64 MIME can be spoofed | Validate magic bytes, dimensions, max megapixels, and re-encode server-side to WebP/AVIF |
| P1 | Direct admin route protection is client-side on frontend | Backend APIs are protected, but admin pages can briefly load shell before redirect | Add server/middleware guard if auth can be cookie-based, or keep API-first security and document frontend limitation |

## Medium Priority Pending

| Area | Pending Item |
|---|---|
| Performance | Convert remaining JPG uploads to WebP/AVIF; largest public assets found: `hero-banner1.webp` ~380 KB, `hero-banner3.webp` ~373 KB, email logos ~275-317 KB |
| Performance | Replace above-the-fold `<img>` on customer-facing pages with `next/image` where dimensions are stable |
| Performance | Add LCP hero/image preload/fetch priority for actual homepage hero asset |
| Performance | Run Lighthouse/PageSpeed/GTmetrix/WebPageTest after deploy; not fully measured locally |
| Accessibility | Fix `TaxonomyCombo` combobox warning: add `aria-controls` and `aria-expanded` |
| Accessibility | Add skip-to-content link and keyboard walkthrough |
| Accessibility | Verify color contrast/focus states with axe/Lighthouse |
| SEO | Add dynamic product sitemap and optional image sitemap |
| SEO | Add canonical rules for filtered/search pages; avoid indexing private/query-only pages |
| SEO | Add product slug URLs such as `/products/saree-name-sku` instead of only numeric IDs |
| Analytics | GA4 exists; GTM is not configured. If GTM is added, delay/lazy-load it and prevent duplicate GA4/Meta events |
| Analytics | Add ecommerce events: view_item, add_to_cart, begin_checkout, purchase, search, error |
| Coupons | Add per-user usage limit and coupon combination rules if needed |
| Wishlist | Frontend uses localStorage; DB wishlist table exists but API sync is not wired |
| Search/filter | Basic search/filter UI exists; typo tolerance/advanced autosuggest not verified |
| Invoice/GST | Invoice number exists; GST calculation/HSN totals need UAT with sample invoices |
| Admin audit | Staff roles exist; activity/audit logs not found |
| Logging | App logs exist through framework/logger; centralized uptime/crash/payment monitoring not configured in repo |
| CI/CD | GitHub deploy workflow exists, but no automated tests/build gate before deploy |
| Deploy | `deploy.sh` uses `git reset --hard origin/main`; confirm server-only backup covers every upload path before each deploy |

## Not Verified Without Credentials / Real Devices

| Checklist Area | Status |
|---|---|
| iPhone Safari / Android Chrome real-device behavior | Pending real-device UAT |
| Keyboard opening behavior on mobile checkout/OTP | Pending real-device UAT |
| Razorpay live/test mode | Pending production settings check |
| Razorpay success/fail/refund/double-payment UAT | Pending sandbox/live transactions |
| MSG91/DLT OTP delivery | Pending valid template, sender ID, balance |
| SMTP SPF/DKIM/DMARC/spam placement | Pending DNS/provider test |
| Delhivery/India Post serviceability, AWB, tracking | Pending live API credentials and test shipment |
| Google Search Console / Google Analytics property access | Pending account access |
| Google Merchant Center feed validation | Feed not found in repo |
| Cloudflare cache/CDN/WAF rules | Partially visible from headers; dashboard settings not verified |
| Backup restore test | Not verifiable from repo |
| Load/stress/high traffic simulation | Not run |
| 50-100 real order UAT | Not run |

## Missing Checklist Items Added

Add these to the launch checklist in addition to the points supplied:

1. Payment idempotency key per checkout attempt.
2. Webhook-driven order recovery for captured payments.
3. Transactional stock locking/decrement under database transaction.
4. Payment/refund reconciliation report in admin.
5. Admin/customer activity audit trail.
6. `security.txt` under `/.well-known/security.txt`.
7. Cookie/consent banner if marketing scripts or Meta/Ads tags are added.
8. Data retention policy for OTP, logs, return media, deleted accounts.
9. Privacy export/delete workflow verification.
10. Dependency vulnerability scan in CI.
11. Automated smoke tests for home, product, cart, checkout, admin login, API health.
12. Staging environment with production-like env vars.
13. Rollback command tested before launch.
14. Cloudflare WAF/rate limiting rules for login, OTP, checkout, admin.
15. Database migration strategy instead of runtime `CREATE/ALTER TABLE` for production changes.
16. Structured server logs with request ID/order ID/payment ID correlation.
17. Sitemap/image sitemap auto-generated from live product catalog.
18. Merchant feed generation and scheduled validation.
19. Accessibility automated checks with axe/Lighthouse.
20. BrowserStack/device-lab matrix for iPhone SE/12/14/15/16, Android low-end, iPad/tablets.

## Recommended Priority Order

1. Deploy current fixes and re-test live headers, www redirect, robots.
2. Fix payment webhook/order creation recovery.
3. Add transactional stock deduction and restore logic.
4. Remove production `devOtp` fallbacks.
5. Add order/customer/admin notifications.
6. Improve product SEO: server metadata, slug URLs, dynamic sitemap.
7. Optimize images and customer-facing `<img>` usage.
8. Complete real-device, payment, courier, email, and load UAT.

