package ai.bhavya.companion

import ai.bhavya.companion.ui.BhavyaTheme
import ai.bhavya.companion.ui.ChildScreen
import ai.bhavya.companion.ui.SetupScreen
import ai.bhavya.companion.web.NativeBridge
import android.Manifest
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  private val app: BhavyaApp
    get() = application as BhavyaApp

  private val permissionsGranted = mutableStateOf(false)
  private val showCameraPermissionDialog = mutableStateOf(false)

  private val androidPermissionLauncher =
      registerForActivityResult(RequestMultiplePermissions()) { result ->
        val granted = result.values.all { it }
        permissionsGranted.value = granted
        if (granted) app.glasses.start(useMock = app.settings.useMockGlasses)
      }

  /** Opens the Meta AI app to ask for the glasses camera. */
  private val glassesCameraLauncher =
      registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
        app.glasses.onCameraPermissionResult(result.getOrDefault(PermissionStatus.Denied))
      }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) {
        app.glasses.permissionRequests.collect { showCameraPermissionDialog.value = true }
      }
    }

    setContent {
      BhavyaTheme {
        val settings = app.settings
        val glassesState by app.glasses.state.collectAsStateWithLifecycle()
        val bridge = remember { NativeBridge(app.glasses, app.speech) }
        var hubUrl by remember { mutableStateOf(settings.hubUrl) }
        var editingSettings by remember { mutableStateOf(settings.hubUrl == null) }

        val currentHub = hubUrl
        if (editingSettings || currentHub == null) {
          SetupScreen(
              initialHubUrl = currentHub,
              initialMock = settings.useMockGlasses,
              glasses = glassesState,
              permissionsGranted = permissionsGranted.value,
              onRequestPermissions = ::requestAndroidPermissions,
              onConnectGlasses = { app.glasses.startRegistration(this) },
              onAllowGlassesCamera = { glassesCameraLauncher.launch(Permission.CAMERA) },
              onMockChanged = { useMock ->
                settings.useMockGlasses = useMock
                // Mock glasses need the phone camera permission; asking again is harmless.
                requestAndroidPermissions()
                app.glasses.setMockGlasses(useMock)
              },
              onSave = { url ->
                settings.hubUrl = url
                hubUrl = url
                editingSettings = false
              },
          )
        } else {
          ChildScreen(
              hubUrl = currentHub,
              bridge = bridge,
              glasses = glassesState,
              onOpenSettings = { editingSettings = true },
          )
        }

        if (showCameraPermissionDialog.value) {
          AlertDialog(
              onDismissRequest = { showCameraPermissionDialog.value = false },
              title = { Text("Allow the glasses camera?") },
              text = {
                Text(
                    "Bhavya uses the glasses camera only during steps in rooms where the camera " +
                        "is allowed. The Meta AI app will open to ask."
                )
              },
              confirmButton = {
                TextButton(
                    onClick = {
                      showCameraPermissionDialog.value = false
                      glassesCameraLauncher.launch(Permission.CAMERA)
                    }
                ) {
                  Text("Continue")
                }
              },
              dismissButton = {
                TextButton(
                    onClick = {
                      showCameraPermissionDialog.value = false
                      app.glasses.onCameraPermissionResult(PermissionStatus.Denied)
                    }
                ) {
                  Text("Not now")
                }
              },
          )
        }
      }
    }
  }

  override fun onStart() {
    super.onStart()
    requestAndroidPermissions()
    app.glasses.onForeground()
  }

  override fun onStop() {
    // Privacy: never keep the glasses camera running while the app is not on screen.
    app.glasses.onBackground()
    app.speech.stop()
    super.onStop()
  }

  private fun requestAndroidPermissions() {
    val permissions = buildList {
      add(Manifest.permission.BLUETOOTH)
      // Before Android 12 this permission does not exist, and asking for it is always denied.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        add(Manifest.permission.BLUETOOTH_CONNECT)
      }
      if (app.settings.useMockGlasses) add(Manifest.permission.CAMERA)
    }
    androidPermissionLauncher.launch(permissions.toTypedArray())
  }
}
