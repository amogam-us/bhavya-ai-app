# Keep the JavaScript bridge methods called from the child web app.
-keepclassmembers class ai.bhavya.companion.web.NativeBridge {
  @android.webkit.JavascriptInterface <methods>;
}
