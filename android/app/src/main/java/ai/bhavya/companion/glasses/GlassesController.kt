package ai.bhavya.companion.glasses

import android.app.Activity
import android.content.Context
import android.util.Log
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoFrame
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.camera.CameraFacing
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Camera state as reported to the child web app (see web/src/lib/native.ts). */
enum class CameraStatus(val wire: String) {
  OFF("off"),
  STARTING("starting"),
  ON("on"),
  NEEDS_PERMISSION("permission"),
  UNAVAILABLE("unavailable"),
  ERROR("error"),
}

data class GlassesState(
    val initialized: Boolean = false,
    val usingMock: Boolean = false,
    val registration: RegistrationState = RegistrationState.UNAVAILABLE,
    val deviceCount: Int = 0,
    val camera: CameraStatus = CameraStatus.OFF,
    /** Last problem worth showing to a person, or null. */
    val message: String? = null,
) {
  val isRegistered: Boolean
    get() = registration == RegistrationState.REGISTERED

  val hasDevice: Boolean
    get() = deviceCount > 0
}

/**
 * Owns the connection to the glasses through the Meta Wearables Device Access Toolkit.
 *
 * The camera runs only while the child app asks for it (a camera-OK step) and the app is in the
 * foreground. Releasing it stops the whole device session and drops the last frame at once, so the
 * hub's privacy gate is mirrored on the device: no session, no frames.
 */
class GlassesController(context: Context) {
  private val appContext = context.applicationContext
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val _state = MutableStateFlow(GlassesState())
  val state: StateFlow<GlassesState> = _state.asStateFlow()

  private val _permissionRequests = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
  /** Emits when the user must allow the glasses camera in the Meta AI app. */
  val permissionRequests: SharedFlow<Unit> = _permissionRequests.asSharedFlow()

  private val latestFrame = AtomicReference<RawFrame?>(null)

  // Written from the web view's bridge thread, read on main and frame threads.
  @Volatile private var cameraWanted = false
  @Volatile private var inForeground = true

  // Main-thread only.
  private var session: DeviceSession? = null
  private var camera: Camera? = null
  private var opening = false
  private val sessionJobs = mutableListOf<Job>()

  /** Initializes the SDK. Call once, after Bluetooth (and, for mock glasses, camera) permission. */
  fun start(useMock: Boolean) {
    if (_state.value.initialized) return
    var ok = true
    Wearables.initialize(appContext).onFailure { error, _ ->
      ok = false
      report(CameraStatus.ERROR, "Could not start the glasses toolkit: ${error.description}")
    }
    if (!ok) return
    _state.update { it.copy(initialized = true) }

    scope.launch {
      Wearables.registrationState.collect { registration ->
        _state.update { it.copy(registration = registration) }
        reopenIfWanted()
      }
    }
    scope.launch {
      Wearables.devices.collect { devices ->
        _state.update { it.copy(deviceCount = devices.size) }
        reopenIfWanted()
      }
    }
    if (useMock) setMockGlasses(true)
  }

  /** Switches between simulated glasses (phone camera) and real glasses. */
  fun setMockGlasses(enabled: Boolean) {
    if (!_state.value.initialized) return
    if (enabled == _state.value.usingMock && enabled == MockDeviceKit.getInstance(appContext).isEnabled) {
      return
    }
    closeSession()
    _state.update { it.copy(usingMock = enabled, message = null) }
    scope.launch {
      withContext(Dispatchers.IO) {
        val kit = MockDeviceKit.getInstance(appContext)
        if (!enabled) {
          kit.disable()
          return@withContext
        }
        kit.enable()
        val glasses = kit.pairGlasses(GlassesModel.RAYBAN_META).getOrNull()
        if (glasses == null) {
          withContext(Dispatchers.Main) { report(CameraStatus.ERROR, "Could not create mock glasses.") }
          return@withContext
        }
        glasses.powerOn()
        glasses.unfold()
        glasses.don()
        // The phone's back camera plays the part of the glasses camera.
        glasses.services.camera.setCameraFeed(CameraFacing.BACK)
      }
      reopenIfWanted()
    }
  }

  /** The child app entered a camera step. Safe to call from any thread. */
  fun requestCamera() {
    cameraWanted = true
    scope.launch { openSessionIfAllowed() }
  }

  /** The child app left the camera step, or the room is private. Safe to call from any thread. */
  fun releaseCamera() {
    cameraWanted = false
    latestFrame.set(null)
    scope.launch {
      closeSession()
      report(CameraStatus.OFF, null)
    }
  }

  /** The app went to the background: stop the camera but remember that the step wants it. */
  fun onBackground() {
    inForeground = false
    latestFrame.set(null)
    closeSession()
    if (cameraWanted) report(CameraStatus.STARTING, null)
  }

  fun onForeground() {
    inForeground = true
    reopenIfWanted()
  }

  fun onCameraPermissionResult(status: PermissionStatus) {
    if (status == PermissionStatus.Granted) {
      reopenIfWanted()
    } else {
      report(CameraStatus.NEEDS_PERMISSION, "Camera access was not allowed in the Meta AI app.")
    }
  }

  fun startRegistration(activity: Activity) {
    Wearables.startRegistration(activity)
  }

  /** The latest frame as a JPEG data URL, or null when the camera is off. Safe from any thread. */
  fun captureJpeg(): String? {
    val frame = latestFrame.get() ?: return null
    return runCatching { FrameEncoder.toJpegDataUrl(frame) }
        .onFailure { Log.w(TAG, "Could not encode a frame", it) }
        .getOrNull()
  }

  fun dispose() {
    cameraWanted = false
    latestFrame.set(null)
    closeSession()
    scope.cancel()
  }

  private fun reopenIfWanted() {
    if (cameraWanted && inForeground && session == null && !opening) {
      scope.launch { openSessionIfAllowed() }
    }
  }

  private suspend fun openSessionIfAllowed() {
    if (!cameraWanted || !inForeground || session != null || opening) return
    val current = _state.value
    if (!current.initialized) return report(CameraStatus.UNAVAILABLE, "The glasses toolkit is not ready.")
    if (!current.isRegistered) {
      return report(CameraStatus.UNAVAILABLE, "Connect the glasses in Bhavya settings first.")
    }
    if (!current.hasDevice) return report(CameraStatus.UNAVAILABLE, "The glasses are not connected.")

    opening = true
    try {
      report(CameraStatus.STARTING, null)
      var granted = false
      Wearables.checkPermissionStatus(Permission.CAMERA)
          .onSuccess { status -> granted = status == PermissionStatus.Granted }
          .onFailure { error, _ -> Log.w(TAG, "Camera permission check failed: ${error.description}") }
      // The privacy gate may have closed while we waited.
      if (!cameraWanted || !inForeground) return
      if (!granted) {
        report(CameraStatus.NEEDS_PERMISSION, "Allow the glasses camera in the Meta AI app.")
        _permissionRequests.tryEmit(Unit)
        return
      }
      openSession()
    } finally {
      opening = false
    }
  }

  private fun openSession() {
    Wearables.createSession(AutoDeviceSelector())
        .onSuccess { created ->
          session = created
          // Subscribe before start() so no state transition is missed.
          observeSession(created)
          created.start()
        }
        .onFailure { error, _ -> report(CameraStatus.ERROR, error.description) }
  }

  private fun observeSession(target: DeviceSession) {
    sessionJobs +=
        scope.launch {
          target.state.collect { sessionState ->
            when (sessionState) {
              DeviceSessionState.STARTED -> attachCamera(target)
              DeviceSessionState.PAUSED -> report(CameraStatus.STARTING, "Paused on the glasses.")
              DeviceSessionState.STOPPED -> if (session === target) onSessionEnded()
              else -> Unit
            }
          }
        }
    sessionJobs +=
        scope.launch {
          target.errors.collect { error -> Log.w(TAG, "Session error: ${error.description}") }
        }
  }

  private fun attachCamera(target: DeviceSession) {
    if (camera != null || session !== target) return
    target
        .addCamera(StreamConfiguration(videoQuality = VideoQuality.MEDIUM, frameRate = FRAME_RATE))
        .onSuccess { added ->
          camera = added
          val stream = added.stream
          sessionJobs +=
              scope.launch(Dispatchers.Default) { stream.videoStream.collect { storeFrame(it) } }
          sessionJobs +=
              scope.launch {
                stream.state.collect { streamState ->
                  when (streamState) {
                    StreamState.STREAMING -> report(CameraStatus.ON, null)
                    StreamState.PAUSED -> report(CameraStatus.STARTING, "Paused on the glasses.")
                    else -> Unit
                  }
                }
              }
          sessionJobs +=
              scope.launch {
                stream.errorStream.collect { error -> Log.w(TAG, "Stream error: ${error.description}") }
              }
          stream.start().onFailure { error, _ -> report(CameraStatus.ERROR, error.description) }
        }
        .onFailure { error, _ -> report(CameraStatus.ERROR, error.description) }
  }

  /** Keeps a copy of the newest decoded frame. Runs on a background thread. */
  private fun storeFrame(frame: VideoFrame) {
    if (frame.isCompressed || !cameraWanted || !inForeground) return
    val needed = I420.frameSize(frame.width, frame.height)
    val source = frame.buffer.duplicate()
    if (source.remaining() < needed) {
      Log.w(TAG, "Unexpected frame size ${source.remaining()} for ${frame.width}x${frame.height}")
      return
    }
    val bytes = ByteArray(needed)
    source.get(bytes)
    latestFrame.set(RawFrame(bytes, frame.width, frame.height))
  }

  private fun onSessionEnded() {
    clearSession()
    if (cameraWanted && inForeground) {
      report(CameraStatus.UNAVAILABLE, "The glasses disconnected.")
    }
  }

  private fun closeSession() {
    val current = session
    clearSession()
    current?.stop()
  }

  private fun clearSession() {
    sessionJobs.forEach { it.cancel() }
    sessionJobs.clear()
    camera = null
    session = null
    latestFrame.set(null)
  }

  private fun report(camera: CameraStatus, message: String?) {
    _state.update { it.copy(camera = camera, message = message) }
  }

  private companion object {
    const val TAG = "BhavyaGlasses"
    /** Frames are only sampled every few seconds, so a low rate saves Bluetooth bandwidth. */
    const val FRAME_RATE = 7
  }
}
