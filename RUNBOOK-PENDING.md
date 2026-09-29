# Mahalaxmi — Pending Kaam Runbook
(Is file me koi secret nahi — repo public hai. Secrets sirf VPS appsettings.json / site_settings me.)

## 0. URGENT: 63 products "Out of Stock" dikha rahe hain — SQL chalao
Product page par har size grey, "OUT OF STOCK", BUY NOW band — 97 me se 63 products
par. Wajah: unke size/colour stock table me har cell 0 hai, jabki Total Qty 500 aur
status "In Stock" hai (Add/Edit form khaali table bhi save kar deta tha).

VPS par repo folder me (jahan docker-compose.yml hai):
```bash
git pull
docker exec -i mfh_postgres psql -U postgres -d mahalaxmi_fashionhub \
  < backend/Scripts/fix-blank-variant-stock.sql
```
Script pehle list print karta hai ki kaun se products theek honge, phir khaali table
hata deta hai. Jo products sach me sold out hain (status "Out of Stock") unhe chhuta
nahi. Koi stock number invent nahi hota.

**Ye SQL chalte hi live site theek — deploy/rebuild ki zarurat nahi.** Code ka fix
(dobara aisa na ho + storefront/backend dono ka safety net) agle normal deploy me
chala jayega.

## 0b. Google: 46 products ka colour reject ho raha hai (deploy ke baad)
Google `color` ko apparel ke liye zaruri maanta hai, aur "MultiColour" (42 products)
aur "Design C" (4 products) ko colour maanta hi nahi — ye items Shopping/free
listing me disapprove hain.

Frontend deploy ke baad:
1. Admin → **Products → 🎨 Colour Fix**. Sirf kharab wale 46 products dikhenge,
   photo ke saath.
2. Har product par **📷 Photo se colour bharo** dabayein — photo me se asli rang
   utha kar 3 circle bhar dega (Navy Blue/Red/Off White jaise).
3. Naam theek lage to **Save**, ya upar se **"Tayyar N save karo"** se sab ek saath.

Iske baad naye/edit hone wale products me galat colour save hi nahi hoga —
Add/Edit Product save rok kar wajah bata dega.

Spec: https://support.google.com/merchants/answer/6324487

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

## 4b. Cashfree Payment Gateway (PRIMARY)
Code ready hai — activate karne ke liye:
1. **DB migration (ek baar):**
```bash
psql -U postgres -d mahalaxmi_fashionhub -f database/migration_cashfree.sql
```
2. **Cashfree dashboard** (merchant.cashfree.com) → Developers → API Keys → App ID + Secret Key copy karo.
3. **VPS appsettings.json** me add karo:
```json
"Cashfree": { "AppId": "<app id>", "SecretKey": "<secret>", "Mode": "production" }
```
(test karna ho to pehle "Mode": "sandbox" + sandbox keys)
4. **Webhook** — Cashfree dashboard → Developers → Webhooks → URL:
`https://mahalaxmifashionhub.com/api/cashfree/webhook` (version 2023-08-01, Payment events)
5. `pm2 restart mahalaxmi-api` → test order lagao.

**Behaviour:** Pay Online = Cashfree first. Keys configured nahi → apne aap Razorpay chalega
(checkout kabhi nahi tootega). Force Razorpay karna ho: Admin → Settings → Payments →
paymentGateway = "razorpay".

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

## Real client IP (do this on the VPS — the app cannot do it alone)

Every rate limit — password guesses, OTP sends — is counted per caller, and the
caller's identity comes from a header. The app now reads that header only when
the connection came from nginx on this same machine, and ignores it otherwise.
That closes the direct-to-port-5000 route. It does not, on its own, make the
header *true*: nginx still passes through whatever arrived.

Two things make it true.

**1. Let nginx work out the real address itself.** In the server block:

```nginx
# Cloudflare's published ranges — refresh from https://www.cloudflare.com/ips/
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

Now `$remote_addr` is the visitor, not Cloudflare, and a forged
`CF-Connecting-IP` from someone who is not Cloudflare is ignored.

**2. Overwrite the headers rather than forwarding what arrived**, in the
`location` that proxies to the API:

```nginx
proxy_set_header X-Real-IP        $remote_addr;
proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
proxy_set_header CF-Connecting-IP $remote_addr;
```

`proxy_set_header` replaces the incoming value, so a header the visitor wrote
never reaches the app.

**3. Shut the back door.** While the origin answers on its own IP
(147.93.104.150), anyone can skip Cloudflare entirely and talk to nginx
directly. Either allow only Cloudflare ranges in the firewall on 80/443, or run
`cloudflared` so the origin has no public port at all.

Check it afterwards: `pm2 logs mahalaxmi-api` while failing a login from a phone
on mobile data — the address it counts should be the phone's, not 127.0.0.1 and
not one you can change by sending a header.

## Rotate the push keys (the old private key is public)

`Program.cs` seeded the Web Push VAPID **private** key as a literal, and that
file is in a repository anyone can read. A VAPID private key is what proves a
notification came from this shop: whoever holds it can send push notifications
that land on our customers' phones wearing our name. It has been committed, so
it is burnt — changing the code does not un-publish it.

The code no longer carries any key. Push notifications stay off until the server
supplies a pair, which is the right way for a secret to be missing: visibly.

1. Generate a new pair on the server:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Put them in `/var/www/mahalaxmi-nextjs/backend/appsettings.json` (this file is
   NOT in git and the deploy script backs it up and restores it):

   ```json
   "Push": {
     "VapidPublicKey":  "<new public key>",
     "VapidPrivateKey": "<new private key>"
   }
   ```

3. Replace the rows that hold the old ones, so the running site picks the new
   pair up rather than the seeded values already in the database:

   ```sql
   UPDATE site_settings SET value = '<new public key>'  WHERE key = 'vapidPublicKey';
   UPDATE site_settings SET value = '<new private key>' WHERE key = 'vapidPrivateKey';
   ```

4. Restart: `pm2 restart mahalaxmi-api`.

Every phone that subscribed under the old public key stops receiving
notifications and has to allow them again — that is unavoidable, and it is the
smaller cost.
