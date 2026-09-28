# Meta (Facebook / Instagram) — Step by Step Working Guide

Aapki "Meta Setup" list ke hisaab se, sahi tarteeb me.
(Is file me koi secret nahi — repo public hai. Saare token sirf Admin → Settings me jaate hain.)

---

## Pehle 1 minute me samajh lijiye

**Code me Meta ka poora kaam pehle se bana hua hai.** Kuch banana nahi hai.
Jo nahi ho raha, wo sirf isliye ki **settings khali padi hain**.

Aaj live site par jaanch kar ke:

| Cheez | Abhi | Iske baad kya hoga |
|---|---|---|
| Pixel (`fbq`) | **chal hi nahi raha** — `undefined` | Pixel ID daalte hi 8 events apne aap chalu |
| Domain verification tag | **head me hai hi nahi** | Token daalte hi tag lag jayega |
| Conversions API | **token khali** | Token daalte hi har order server se Meta jayega |
| Catalog feed | **tayyar hai** — 311 rows, 97 products | bas Meta me URL daalna hai |
| Cloudflare Zaraz | **band hai** | double counting ka koi khatra nahi ✅ |

Wo aakhri line zaruri hai: pehle dar tha ki Cloudflare me bhi Pixel laga ho to
har event do baar ginega. Maine dekh liya — `window.zaraz` hai hi nahi, aur page
par Facebook ka koi script nahi. To site par Pixel ID daalna **safe hai**.

**Events jo code me pehle se bane hain** (Pixel ID daalte hi chalu ho jayenge):
ViewContent · AddToCart · InitiateCheckout · Purchase · CompleteRegistration ·
Lead · AddToWishlist · Search

---

## ⚠️ Main kya nahi karunga

- Aapka Google/Meta **password kabhi nahi** daalunga
- Meta ki **terms accept** ya **business verification submit** nahi karunga
- **Payment/billing** details nahi bharunga
- **Token/secret chat me mat bhejiyega** — seedha Admin → Settings me paste karein.
  Mujhe sirf itna batayiye "ho gaya", main verify kar dunga.

---

## Step 1 — Business Portfolio (Business Manager)

`business.facebook.com` → agar portfolio nahi hai to banayein.
Usi ke andar aapka Facebook Page aur Instagram professional account jud jaate hain.

Aapki list me Page aur Instagram par ✅ laga hai, to bas confirm kar lijiye ki
dono **isi portfolio ke andar** dikh rahe hain.

**Verify:** Business Settings → Accounts → Pages / Instagram accounts me dono dikhen.

---

## Step 2 — Domain Verification ⭐

Ye pehle karna hai, kyunki iske bina iOS wale customers ke events adhoore aate
hain (Aggregated Event Measurement) aur Shop/Commerce bhi aage nahi badhta.

1. `business.facebook.com/settings` → baayein menu me **Brand Safety & Suitability**
   → **Domains**
   (Meta menu ke naam badalta rehta hai — na mile to Business Settings me
   "Domains" search kar lijiye.)
2. **Add** → `mahalaxmifashionhub.com` daalein
3. Tareeqa chunein: **"Add a meta tag to your HTML source code"**
4. Meta jo tag dega wo aisa dikhega:
   `<meta name="facebook-domain-verification" content="abc123xyz..." />`
   **Sirf `content=""` ke andar wali value copy karein** — poora tag nahi.
5. Admin → Settings → **SEO — Verification, Analytics & Robots** →
   **Meta domain verification token** → wahi value paste → Save
6. Meta par wapas jaakar **Verify domain** dabayein

**Verify:** website par right-click → View Page Source → `facebook-domain-verification`
search karein. Dikh gaya to Meta par verify turant ho jayega.

---

## Step 3 — Dataset / Pixel ⭐ (sabse bada asar yahi karega)

1. `business.facebook.com/events_manager` → **Connect data source** → **Web**
2. Dataset ka naam: `Mahalaxmi Fashion Hub`
3. Ban jaane par **Dataset ID** milega — sirf numbers, 15-16 digit ka
4. Admin → Settings → **SEO — Verification, Analytics & Robots** →
   **Facebook Pixel ID** → wahi number paste → Save

Bas itna. Koi code copy-paste nahi karna — site khud lagati hai.

**Verify:** website kholein, F12 → Console me `typeof fbq` likhein.
Ab `"function"` aana chahiye (abhi `"undefined"` aata hai).
Aur Events Manager me thodi der me **PageView** dikhne lagega.

---

## Step 4 — Conversions API ⭐ (server se)

Pixel akela kaafi nahi. Ad blocker, app ke andar payment, UPI redirect —
in sab me browser ka event gum ho jata hai, aur Meta unhi purchases par bid
karta hai jo use dikhte hain. Isliye order server se bhi bheja jata hai.

1. Events Manager → apna dataset → **Settings** → **Conversions API** →
   **Generate access token**
2. Token copy karein — **chat me mat bhejiyein**
3. Admin → Settings → **SEO — Verification, Analytics & Robots** →
   **Meta Conversions API access token** → paste → Save

**Double counting ka darr mat rakhiye:** order ID hi event ID banke dono taraf
jaata hai, isliye Meta dono ko ek hi purchase maanta hai. Ye code me pehle se hai.

**Verify:** ek test order karein (COD, phir cancel kar dena). Events Manager →
dataset → **Purchase** event par do source dikhne chahiye: *Browser* aur *Server*,
aur "Deduplication" me count **1** hi rehna chahiye, 2 nahi.

---

## Step 5 — Catalog ⭐ (Shopping ads / Instagram tagging ke liye)

Feed tayyar hai, kuch banana nahi:

```
https://www.mahalaxmifashionhub.com/facebook-feed.xml
```

1. `business.facebook.com/commerce` → **Catalogue** → **Create catalogue** →
   **E-commerce**
2. **Add items** → **Data feed** → **Scheduled feed** (URL wala option)
3. Upar wala URL daalein, frequency **Daily**
4. Ban jaane ke baad catalogue ko apne **Dataset (Pixel)** se connect karein —
   tabhi Meta jaan payega ki kaun sa product kisne dekha.

**Verify:** catalogue me **311 items** aane chahiye (97 products ke saare
size/colour variants). Google jaisa hi hisaab hai.

---

## Step 6 — Ad Account

1. Business Settings → **Accounts → Ad accounts** → **Add** → naya banayein
2. Ad account ko **Page**, **Instagram**, **Dataset** aur **Catalogue** se jodein
3. Payment method **aap khud** daalein — main billing details nahi bharunga

**Verify:** Ads Manager khule aur account active dikhe.

Agar admin panel se ad budget control karna ho (ye feature pehle se bana hai):
Admin → Settings → **Meta Ads (Facebook & Instagram)** me
`Ad Account ID` (sirf `act_` ke baad ke digits) aur System User token daalein.

---

## Step 7 — Developer App (App ID + Secret) — sirf agar ye chahiye

Iski zarurat **sirf** in teen cheezon ke liye hai:
Facebook se login, Lead Ads ke leads apne aap aana, ya Ads API se budget control.
**Pixel, CAPI, Catalog aur normal ads ke liye iski zarurat nahi hai.**

1. `developers.facebook.com` → **My Apps** → **Create App** → type: **Business**
2. App ID aur App Secret milenge
3. Admin → Settings me:
   - **Social Login Options** → `Facebook App ID`, `Facebook App Secret`
   - **Meta Lead Ads** → `Page Access Token` (permission: `leads_retrieval`),
     aur `Webhook Verify Token` (koi bhi apni marzi ka secret string — wahi Meta me bhi daalein)
4. OAuth redirect URI: `https://www.mahalaxmifashionhub.com/api/auth/facebook/callback`

> **Dhyan dein:** abhi site par ek App ID pehle se set hai jo `1746287966…` se
> shuru hota hai, jabki aapne pehle `901817626269385` bataya tha. Do alag apps
> lagti hain. Kaun sa sahi hai ye confirm kar lijiye, warna Facebook login
> galat app se chalega.

---

## Optional — baad me

| Cheez | Kab chahiye |
|---|---|
| Commerce / Shop setup | Jab Instagram/Facebook par hi checkout karana ho |
| WhatsApp Business API | Jab WhatsApp automation chahiye (abhi MSG91 se OTP chal raha hai) |
| Webhooks | Jab Lead Ads ke leads apne aap panel me aane chahiye |

---

## Tarteeb ek nazar me

```
1. Business Portfolio        ← sab isi par tika hai
2. Domain Verification  ⭐   ← Settings: facebookDomainVerification
3. Dataset / Pixel      ⭐   ← Settings: facebookPixelId      ← sabse bada asar
4. Conversions API      ⭐   ← Settings: metaCapiAccessToken
5. Catalog              ⭐   ← facebook-feed.xml
6. Ad Account
7. Developer App (optional)
```

Step 2, 3, 4 kar lijiye — usi se asli kaam chalu ho jata hai.
Har step ke baad mujhe bata dijiye, main live jaanch kar ke confirm kar dunga.
