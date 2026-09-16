package com.mahalaxmifashionhub.www.twa

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.io.File
import java.io.FileOutputStream

/**
 * Mahalaxmi Fashion Hub - native Android shell around the storefront.
 *
 * This is a real coded WebView app, NOT a Trusted Web Activity. Because we own
 * the WebView we can do the three things a TWA could not:
 *
 *  1. Send customers straight into Google Pay / PhonePe / Paytm / any UPI or bank
 *     app when Cashfree hands us a upi:// or intent:// link (see [handleUrl]).
 *  2. Tag the User-Agent with "MahalaxmiApp", so the website can hide the cookie
 *     banner, the "Join Our Family" popup and the push prompt inside the app.
 *  3. Keep everything - checkout, bank 3-D Secure pages, invoices - inside the
 *     app, with no "running in Chrome" bar anywhere.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var offline: LinearLayout

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraRequest: PermissionRequest? = null
    private var lastBackPress = 0L
    private var loadFailed = false
    private var askedForNotifications = false

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = filePathCallback
            filePathCallback = null
            cb?.onReceiveValue(
                if (result.resultCode == RESULT_OK) {
                    WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                } else {
                    null
                }
            )
        }

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingCameraRequest
            pendingCameraRequest = null
            if (request == null) return@registerForActivityResult
            if (granted) request.grant(request.resources) else {
                request.deny()
                toast(getString(R.string.camera_needed))
            }
        }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best effort */ }

    // ---------------------------------------------------------------- lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        refresh = findViewById(R.id.refresh)
        progress = findViewById(R.id.progress)
        offline = findViewById(R.id.offline)

        applyInsets()
        configureWebView()

        refresh.setColorSchemeColors(ContextCompat.getColor(this, R.color.brand))
        refresh.setOnRefreshListener { web.reload() }
        // Pull-to-refresh must not fight the page's own scrolling or its carousels.
        refresh.setOnChildScrollUpCallback { _, _ -> web.scrollY > 0 }

        findViewById<Button>(R.id.retry).setOnClickListener {
            offline.visibility = View.GONE
            loadFailed = false
            web.reload()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack()
                    return
                }
                val now = System.currentTimeMillis()
                if (now - lastBackPress < 2000) {
                    finish()
                } else {
                    lastBackPress = now
                    toast(getString(R.string.exit_hint))
                }
            }
        })

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl(intentUrl(intent) ?: START_URL)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intentUrl(intent)?.let { web.loadUrl(it) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        web.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Only follow a VIEW intent if it points at our own site. */
    private fun intentUrl(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val data = intent.data ?: return null
        return if (isSiteHost(data.host)) data.toString() else null
    }

    /**
     * Only asked the first time a download starts - DownloadManager shows its
     * progress in the notification shade. Never a cold prompt on first launch.
     */
    private fun askForNotificationPermission() {
        if (askedForNotifications) return
        askedForNotifications = true
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /**
     * targetSdk 35+ always draws edge to edge, so pad the content by the system
     * bars ourselves - otherwise the header sits under the status bar and the
     * bottom nav under the gesture bar.
     */
    private fun applyInsets() {
        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            insets
        }
    }

    // ---------------------------------------------------------------- web view

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // The website looks for this tag and hides the cookie banner, the
            // "Join Our Family" popup and the browser push prompt.
            userAgentString = "$userAgentString $UA_TAG"
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            // Cashfree's hosted checkout and the bank OTP pages are third-party
            // frames; without this the payment session is lost halfway.
            setAcceptThirdPartyCookies(web, true)
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.page_bg))
        web.isVerticalScrollBarEnabled = true
        web.addJavascriptInterface(Saver(), "MahalaxmiSaver")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                handleUrl(request.url.toString())

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                loadFailed = false
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String) {
                progress.visibility = View.GONE
                refresh.isRefreshing = false
                CookieManager.getInstance().flush()
                if (!loadFailed) offline.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (!request.isForMainFrame) return
                loadFailed = true
                progress.visibility = View.GONE
                refresh.isRefreshing = false
                offline.visibility = View.VISIBLE
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                if (newProgress >= 100) progress.visibility = View.GONE
            }

            /**
             * Links with target="_blank" and window.open() - used by some payment
             * screens. Decide where the new URL belongs instead of dropping it.
             */
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean {
                val probe = WebView(view.context)
                probe.settings.javaScriptEnabled = true
                probe.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        v: WebView,
                        request: WebResourceRequest
                    ): Boolean {
                        val url = request.url.toString()
                        if (!handleUrl(url)) web.loadUrl(url)
                        v.post { v.destroy() }
                        return true
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = probe
                resultMsg.sendToTarget()
                return true
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }

            /** Camera access for review photos / profile picture. */
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                if (!wantsCamera) {
                    request.deny()
                    return
                }
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    request.grant(request.resources)
                } else {
                    pendingCameraRequest = request
                    cameraPermission.launch(Manifest.permission.CAMERA)
                }
            }
        }

        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startDownload(url, userAgent, contentDisposition, mimeType)
        }
    }

    // ---------------------------------------------------------------- routing

    /** @return true when we handled the URL ourselves and the WebView must not load it. */
    private fun handleUrl(url: String): Boolean {
        val uri = try { Uri.parse(url) } catch (e: Exception) { return false }
        return when ((uri.scheme ?: "").lowercase()) {
            "http", "https" -> {
                if (isExternalHost(uri.host)) {
                    openExternally(uri)
                    true
                } else {
                    // The storefront AND every payment/bank page stay inside the
                    // app - that is the whole point of owning the WebView.
                    false
                }
            }
            // Chrome's intent:// syntax - Cashfree uses it for wallet hand-off.
            "intent" -> openIntentUrl(url)
            "javascript", "about", "blob", "data", "file" -> false
            "mailto", "tel", "sms", "smsto", "geo", "market" -> {
                openExternally(uri)
                true
            }
            // upi://, phonepe://, tez://, paytmmp://, credpay://, bank apps…
            else -> openPaymentApp(uri)
        }
    }

    private fun isSiteHost(host: String?): Boolean {
        val h = (host ?: "").lowercase()
        return h == SITE_DOMAIN || h.endsWith(".$SITE_DOMAIN")
    }

    private fun isExternalHost(host: String?): Boolean {
        val h = (host ?: "").lowercase()
        if (isSiteHost(h)) return false
        return EXTERNAL_HOSTS.any { h == it || h.endsWith(".$it") }
    }

    private fun openExternally(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            toast(getString(R.string.no_app_for_link))
        }
    }

    /**
     * Hands a UPI / wallet deep link to the installed app. A plain upi://pay link
     * is generic, so we show the app chooser and the customer taps Google Pay,
     * PhonePe, Paytm or whichever app they use. App-specific schemes go straight
     * to that one app.
     */
    private fun openPaymentApp(uri: Uri): Boolean {
        val view = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (view.resolveActivity(packageManager) == null) {
            toast(getString(R.string.no_upi_app))
            return true
        }
        val launch = if ((uri.scheme ?: "").equals("upi", ignoreCase = true)) {
            Intent.createChooser(view, getString(R.string.pay_using))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        } else {
            view
        }
        return try {
            startActivity(launch)
            true
        } catch (e: ActivityNotFoundException) {
            toast(getString(R.string.no_upi_app))
            true
        }
    }

    private fun openIntentUrl(url: String): Boolean {
        val intent = try {
            Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
        } catch (e: Exception) {
            return true
        }
        // Never let a web page aim an intent at an arbitrary internal component.
        intent.component = null
        intent.selector = null
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            startActivity(intent)
            return true
        } catch (e: ActivityNotFoundException) {
            // fall through to the fallbacks below
        }

        intent.getStringExtra("browser_fallback_url")?.takeIf { it.isNotBlank() }?.let {
            if (!handleUrl(it)) web.loadUrl(it)
            return true
        }
        intent.`package`?.takeIf { it.isNotBlank() }?.let {
            openExternally(Uri.parse("https://play.google.com/store/apps/details?id=$it"))
            return true
        }
        toast(getString(R.string.no_app_for_link))
        return true
    }

    // ---------------------------------------------------------------- downloads

    private fun startDownload(url: String, userAgent: String?, disposition: String?, mimeType: String?) {
        // Invoices are generated in the browser, so they arrive as blob: URLs that
        // DownloadManager cannot fetch - read them through JS and save the bytes.
        if (url.startsWith("blob:")) {
            web.evaluateJavascript(blobReaderJs(url, mimeType ?: "application/octet-stream"), null)
            return
        }
        if (url.startsWith("data:")) {
            saveDataUrl(url, URLUtil.guessFileName(url, disposition, mimeType))
            return
        }
        askForNotificationPermission()
        try {
            val name = URLUtil.guessFileName(url, disposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("User-Agent", userAgent ?: web.settings.userAgentString)
                CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                setTitle(name)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            toast(getString(R.string.downloading, name))
        } catch (e: Exception) {
            toast(getString(R.string.download_failed))
        }
    }

    private fun blobReaderJs(blobUrl: String, mimeType: String): String {
        val safeUrl = blobUrl.replace("'", "\\'")
        val safeMime = mimeType.replace("'", "\\'")
        return """
            (function () {
              try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', '$safeUrl', true);
                xhr.responseType = 'blob';
                xhr.onload = function () {
                  if (xhr.status !== 200 && xhr.status !== 0) return;
                  var reader = new FileReader();
                  reader.onloadend = function () {
                    MahalaxmiSaver.save(String(reader.result), '$safeMime');
                  };
                  reader.readAsDataURL(xhr.response);
                };
                xhr.send();
              } catch (e) {}
            })();
        """.trimIndent()
    }

    /** Called back from [blobReaderJs] with a data: URL. */
    inner class Saver {
        @android.webkit.JavascriptInterface
        fun save(dataUrl: String, mimeType: String) {
            runOnUiThread {
                // Only our own pages may write a file - never a gateway page.
                val host = try { Uri.parse(web.url ?: "").host } catch (e: Exception) { null }
                if (!isSiteHost(host)) return@runOnUiThread
                saveDataUrl(dataUrl, suggestName(mimeType))
            }
        }
    }

    private fun suggestName(mimeType: String): String {
        val stamp = System.currentTimeMillis()
        val ext = when {
            mimeType.contains("pdf") -> "pdf"
            mimeType.contains("png") -> "png"
            mimeType.contains("jpeg") || mimeType.contains("jpg") -> "jpg"
            mimeType.contains("csv") -> "csv"
            else -> "bin"
        }
        return "mahalaxmi-$stamp.$ext"
    }

    private fun saveDataUrl(dataUrl: String, fileName: String) {
        try {
            val comma = dataUrl.indexOf(',')
            if (comma < 0) throw IllegalArgumentException("bad data url")
            val header = dataUrl.substring(0, comma)
            val payload = dataUrl.substring(comma + 1)
            val bytes = if (header.contains("base64")) {
                Base64.decode(payload, Base64.DEFAULT)
            } else {
                Uri.decode(payload).toByteArray()
            }
            val mime = header.removePrefix("data:").substringBefore(';').ifBlank { "application/octet-stream" }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("no uri")
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                @Suppress("DEPRECATION")
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!dir.exists()) dir.mkdirs()
                FileOutputStream(File(dir, fileName)).use { it.write(bytes) }
            }
            toast(getString(R.string.saved_to_downloads, fileName))
        } catch (e: Exception) {
            toast(getString(R.string.download_failed))
        }
    }

    private fun toast(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    }

    companion object {
        private const val SITE_DOMAIN = "mahalaxmifashionhub.com"
        private const val START_URL = "https://www.mahalaxmifashionhub.com/"

        /** Appended to the WebView User-Agent; the website checks for this. */
        private const val UA_TAG = "MahalaxmiApp/1.0"

        /** Links that genuinely belong in another app, not in our shell. */
        private val EXTERNAL_HOSTS = listOf(
            "wa.me",
            "api.whatsapp.com",
            "web.whatsapp.com",
            "play.google.com",
            "instagram.com",
            "facebook.com",
            "youtube.com",
            "youtu.be",
            "maps.google.com",
            "goo.gl"
        )
    }
}
