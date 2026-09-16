# Mahalaxmi Fashion Hub — Android app

A **real coded Android app**, not a TWA and not a Bubblewrap wrapper.
The storefront runs inside a `WebView` that this project owns, which is what makes
UPI redirection, in-app checkout and popup suppression possible.

| | Old app (TWA) | This app |
|---|---|---|
| Built from | Bubblewrap / Chrome Custom Tab | Kotlin + Android Studio |
| "Running in Chrome" bar | shown | **gone** |
| `upi://` / `intent://` links | Chrome swallowed them | **opens GPay / PhonePe / Paytm / any UPI app** |
| Cookie banner, "Join Our Family", push prompt | shown | **hidden** |
| Third-party cookies (Cashfree, bank OTP) | not controllable | explicitly enabled |
| targetSdk | 33 | **36 (Android 16)** |

Package name, keystore and signing key are **unchanged**, so a build from here
updates the existing Play listing — it does not create a second app.

---

## 1. What you need

* **Android Studio** — Meerkat (2024.3) or newer
* **JDK 17** — bundled with Android Studio, nothing to install
* **Android SDK Platform 36** — Android Studio → *SDK Manager* → tick **Android 16 (API 36)**

## 2. Open the project

In Android Studio: **File → Open…** and pick this `android` folder (not the repo root).

The Gradle wrapper `.jar` is not committed. On first open Android Studio will offer to
create/sync the wrapper — accept it. If you ever want the command line to work:

```
gradle wrapper --gradle-version 8.13
```

## 3. Run it on a phone

Connect the phone with USB debugging on, press ▶ **Run**. That installs the debug build.

## 4. Build the release

The signing details are read from `keystore.properties` (git-ignored). It already points at:

```
F:/Download/Mahalaxmi - Google Play package/signing.keystore
alias: my-key-alias
```

**If you ever move that folder, fix the `storeFile` line in `keystore.properties`.**
A sample is in `keystore.properties.example`.

```
# Play Store upload file (.aab)
gradlew bundleRelease
  -> app/build/outputs/bundle/release/app-release.aab

# Installable file for testing / WhatsApp sharing (.apk)
gradlew assembleRelease
  -> app/build/outputs/apk/release/app-release.apk
```

On Windows use `gradlew.bat`. Or from Android Studio: **Build → Generate Signed App Bundle / APK**.

### Version numbers

`app/build.gradle.kts` → `versionCode = 100`, `versionName = "2.0.0"`.

Play rejects an upload whose `versionCode` is not higher than the last one.
**Every upload: raise `versionCode` by 1** (101, 102, …). `versionName` is what
customers see — bump it when the change is worth showing.

## 5. Upload to Play Console

1. Play Console → **Mahalaxmi Fashion Hub** → *Production* → **Create new release**
2. Upload `app-release.aab`
3. Release notes, then *Next* → *Rollout*

Because the package name and key are identical, existing customers get this as a
normal update.

---

## How the UPI redirection works

This is the part Cashfree asked for. `MainActivity.handleUrl()` routes every URL:

| URL the page opens | What the app does |
|---|---|
| `https://…mahalaxmifashionhub.com/…` | stays in the WebView |
| any other `https://` (Cashfree, bank 3-D Secure, OTP pages) | **stays in the WebView** — checkout is never handed to a browser |
| `upi://pay?…` | app chooser → customer taps GPay / PhonePe / Paytm / any UPI app |
| `phonepe://`, `tez://`, `paytmmp://`, `credpay://`, bank app schemes | opens that app directly |
| `intent://…#Intent;…;end` | `Intent.parseUri(…, URI_INTENT_SCHEME)`; if the app is missing it follows `browser_fallback_url`, else offers the Play Store page |
| `wa.me`, `play.google.com`, Instagram, Facebook, YouTube | opens the real app outside |
| `tel:`, `mailto:`, `sms:`, `geo:`, `market:` | handed to the system |

Two supporting pieces make it actually work:

* **`<queries>` in `AndroidManifest.xml`** — since Android 11, `startActivity()` for a
  `upi://` link fails silently unless the other apps are declared. Every major UPI app
  and the `upi` scheme itself are listed there.
* **`CookieManager.setAcceptThirdPartyCookies(web, true)`** — without it the Cashfree
  session dies between the checkout frame and the bank page.

## How the website knows it is inside the app

The WebView appends `MahalaxmiApp/1.0` to the User-Agent
(`MainActivity.UA_TAG`). The website reads it in `frontend/lib/inApp.ts`:

* `isNativeApp()` — true only inside this app
* `isInApp()` — also true for an installed PWA / the old TWA

Used by `CookieConsent`, `WelcomePopup` ("Join Our Family"), `PushOptIn` and
`PwaInstaller` ("Get the App"), so none of them ever appear inside the app.

**If you change `UA_TAG` in Kotlin, change `APP_UA_TAG` in `lib/inApp.ts` to match.**

## Other things already handled

* **Invoice downloads** — the invoice is generated in the browser as a `blob:` URL,
  which `DownloadManager` cannot fetch. The app reads it through JS and writes it to
  the phone's **Downloads** folder.
* **Photo upload** — review photos and the profile picture use `onShowFileChooser`
  plus a camera permission prompt.
* **Deep links** — `assetlinks.json` is already live for this package, so
  `https://www.mahalaxmifashionhub.com/...` links open straight in the app.
* **Edge-to-edge** — Android 15+ forces it; window insets are applied so the header
  never hides under the status bar and the keyboard never covers an input.
* **Back button** — goes back through site history, then "press back again to exit".
* **Pull to refresh** — only when the page is already scrolled to the top, so it does
  not fight the product carousels.
* **Offline** — a retry screen instead of Chrome's dinosaur page.

## Not done yet

* **Push notifications.** Web push does not work inside a WebView. Order updates by
  notification would need Firebase Cloud Messaging: an FCM service in this app plus a
  send call from the backend. Say the word and it can be added.

---

## Reply for the Cashfree tech team

> We have replaced our Trusted Web Activity with a native Android application that
> hosts the checkout in an application-owned `WebView` (package
> `com.mahalaxmifashionhub.www.twa`).
>
> UPI app redirection and URL handling are implemented:
>
> 1. `WebViewClient.shouldOverrideUrlLoading` inspects every URL. Non-HTTP schemes
>    (`upi://`, `phonepe://`, `tez://`, `paytmmp://`, `credpay://`, bank schemes) are
>    dispatched with `Intent.ACTION_VIEW`; a generic `upi://pay` link is launched
>    through `Intent.createChooser` so the customer selects their UPI app.
> 2. `intent://…#Intent;…;end` URLs are parsed with
>    `Intent.parseUri(url, Intent.URI_INTENT_SCHEME)`, with `browser_fallback_url`
>    and a Play Store fallback when the target app is not installed.
> 3. A `<queries>` element declares the `upi` scheme and the major UPI/wallet
>    packages, so intent resolution works on Android 11+ package visibility.
> 4. `window.open` / `target="_blank"` is handled via
>    `WebChromeClient.onCreateWindow`, and third-party cookies are enabled with
>    `CookieManager.setAcceptThirdPartyCookies`, so the hosted checkout and bank
>    3-D Secure pages complete inside the app.
>
> Please enable the feature flag for our merchant account.
