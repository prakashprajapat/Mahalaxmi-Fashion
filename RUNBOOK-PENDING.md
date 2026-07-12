# Mahalaxmi — Pending Kaam Runbook
(Is file me koi secret nahi — repo public hai. Secrets sirf VPS appsettings.json / site_settings me.)

## 1. SECURITY: JWT key (VPS pe)
```bash
ssh <vps>
openssl rand -base64 48          # ye output copy karo
sudo nano /var/www/mahalaxmi-backend/appsettings.json   # Jwt:Key me paste karo
pm2 restart mahalaxmi-api
```
Note: key badalte hi sab purane login tokens invalid — admin/customers ko dobara login karna hoga.

## 2. SECURITY: Razorpay + Delhivery keys rotate
1. Razorpay Dashboard → Settings → API Keys → **Regenerate Live Key**.
2. Nayi KeyId/KeySecret VPS appsettings.json (`Razorpay` section) me daalo.
3. Delhivery One panel → Settings → API Setup → token **regenerate**.
4. Naya token site_settings me daalo (niche step 3) — DelhiveryService wahi se uthata hai.
5. `pm2 restart mahalaxmi-api` → test payment + test AWB.

## 3. Delhivery settings (site_settings)
Option A — Admin panel → Settings me `delhivery_token` + `delhivery_pickup_name` set karo.
Option B — SQL: `database/set_delhivery_settings.sql` me values bharo, phir:
```bash
psql -U postgres -d mahalaxmi_fashionhub -f database/set_delhivery_settings.sql
```
(pickup_name = Delhivery panel me registered warehouse ka EXACT naam)

## 4. MSG91 Order SMS (code is commit me ready)
`SmsService.SendNewOrderSmsAsync` + OrdersController hook laga diya hai.
Jab tak `msg91OrderTemplateId` set nahi, SMS silently skip hota hai — deploy safe.

**DLT template banwao (MSG91 panel):**
- Type: Transactional / Service-Implicit
- Content suggestion:
  `Thank you for shopping with Mahalaxmi Fashion Hub! Your order ##order_id## of Rs ##amount## has been received. Track: mahalaxmifashionhub.com/tracking - MAHFHB`
- Variables `##order_id##`, `##amount##` (code var1/var2 fallback bhi bhejta hai)

**Approval ke baad** MSG91 me Flow banao, phir Admin → Settings me set karo:
- `msg91AuthKey` (agar OTP ke liye pehle se set hai to already hoga)
- `msg91OrderTemplateId` = naya flow/template ID
- `msg91SenderId` (DLT sender, e.g. MAHFHB)
Test COD order lagakar SMS verify karo.

## 5. Deploy
```bash
ssh <vps> && cd /var/www/mahalaxmi-nextjs && bash deploy.sh
```

## 6. Deploy ke baad verify
- Product page → F12 Console: `window.dataLayer.filter(e=>e.event==='view_item')`
- `https://mahalaxmifashionhub.com/feed/google-merchant.xml` → products XML
- `https://mahalaxmifashionhub.com/sitemap.xml` → product URLs
- Admin → 💰 Payment Reconcile → last 30 days chala ke dekho
- `pm2 logs mahalaxmi-api --lines 50`
