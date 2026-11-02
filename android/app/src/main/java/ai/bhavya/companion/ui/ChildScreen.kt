package ai.bhavya.companion.ui

import ai.bhavya.companion.glasses.GlassesState
import ai.bhavya.companion.isHubPage
import ai.bhavya.companion.web.NativeBridge
import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * The child app from the home hub, shown full screen. A thin strip on top shows the glasses
 * status; holding it opens the parent setup screen, so a quick tap from the child does nothing.
 */
@Composable
fun ChildScreen(
    hubUrl: String,
    bridge: NativeBridge,
    glasses: GlassesState,
    onOpenSettings: () -> Unit,
) {
  var webView by remember { mutableStateOf<WebView?>(null) }
  var loadError by remember { mutableStateOf<String?>(null) }

  // Back goes back inside the child app, but never closes it by accident.
  BackHandler { webView?.takeIf { it.canGoBack() }?.goBack() }

  Column(Modifier.fillMaxSize().systemBarsPadding()) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(MaterialTheme.colorScheme.primaryContainer)
                .pointerInput(Unit) { detectTapGestures(onLongPress = { onOpenSettings() }) }
                .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
          glassesSummary(glasses),
          style = MaterialTheme.typography.labelLarge,
          modifier = Modifier.weight(1f),
      )
      Text("Hold for settings", style = MaterialTheme.typography.labelSmall)
    }

    Box(Modifier.fillMaxSize()) {
      HubWebView(
          url = "$hubUrl/child",
          hubOrigin = hubUrl,
          bridge = bridge,
          onCreated = { webView = it },
          onPageLoading = { loadError = null },
          onLoadFailed = { loadError = it },
      )
      loadError?.let { error ->
        LoadErrorPanel(
            hubUrl = hubUrl,
            error = error,
            onRetry = {
              loadError = null
              webView?.reload()
            },
            onOpenSettings = onOpenSettings,
        )
      }
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun HubWebView(
    url: String,
    hubOrigin: String,
    bridge: NativeBridge,
    onCreated: (WebView) -> Unit,
    onPageLoading: () -> Unit,
    onLoadFailed: (String) -> Unit,
) {
  // A microphone request from the page waits here while Android asks the user.
  var pendingMicRequest by remember { mutableStateOf<PermissionRequest?>(null) }
  val micPermission =
      rememberLauncherForActivityResult(RequestPermission()) { granted ->
        pendingMicRequest?.let { if (granted) it.grant(MIC_ONLY) else it.deny() }
        pendingMicRequest = null
      }

  AndroidView(
      modifier = Modifier.fillMaxSize(),
      factory = { context ->
        WebView(context).apply {
          settings.javaScriptEnabled = true
          settings.domStorageEnabled = true
          // Lets the chime play without another tap after the child taps Start.
          settings.mediaPlaybackRequiresUserGesture = false
          settings.allowFileAccess = false
          settings.allowContentAccess = false
          addJavascriptInterface(bridge, "BhavyaNative")
          webViewClient =
              object : WebViewClient() {
                // Never navigate away from the hub, so no other site can reach the bridge.
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = !isHubPage(request.url.toString(), hubOrigin)

                override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                  onPageLoading()
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                  if (request.isForMainFrame) onLoadFailed(error.description.toString())
                }
              }
          webChromeClient =
              object : WebChromeClient() {
                // Only the hub may use the microphone (for the Talk button), and nothing else:
                // camera frames come from the glasses through the bridge.
                override fun onPermissionRequest(request: PermissionRequest) {
                  val micOnly = request.resources.toList() == MIC_ONLY.toList()
                  if (!micOnly || !isHubPage(request.origin.toString(), hubOrigin)) {
                    request.deny()
                    return
                  }
                  val allowed =
                      context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                          PackageManager.PERMISSION_GRANTED
                  if (allowed) {
                    request.grant(MIC_ONLY)
                  } else {
                    pendingMicRequest?.deny()
                    pendingMicRequest = request
                    micPermission.launch(Manifest.permission.RECORD_AUDIO)
                  }
                }

                override fun onPermissionRequestCanceled(request: PermissionRequest) {
                  if (pendingMicRequest == request) pendingMicRequest = null
                }
              }
          loadUrl(url)
          onCreated(this)
        }
      },
      onRelease = { it.destroy() },
  )
}

@Composable
private fun LoadErrorPanel(
    hubUrl: String,
    error: String,
    onRetry: () -> Unit,
    onOpenSettings: () -> Unit,
) {
  Column(
      modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
      horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
        "Can't reach the home hub",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
    )
    Text(
        "Check that the hub is running and this phone is on the same Wi-Fi.\n$hubUrl\n($error)",
        textAlign = TextAlign.Center,
    )
    Button(onClick = onRetry) { Text("Try again") }
    OutlinedButton(onClick = onOpenSettings) { Text("Change hub address") }
  }
}

private val MIC_ONLY = arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
