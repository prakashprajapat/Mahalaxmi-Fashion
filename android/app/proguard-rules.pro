# The @JavascriptInterface bridge is called from JavaScript by name, so R8 must
# not rename or strip it.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keep class com.mahalaxmifashionhub.www.twa.** { *; }
