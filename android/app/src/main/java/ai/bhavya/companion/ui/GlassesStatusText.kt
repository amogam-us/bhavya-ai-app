package ai.bhavya.companion.ui

import ai.bhavya.companion.glasses.CameraStatus
import ai.bhavya.companion.glasses.GlassesState

/** One short line describing the glasses, for the status strip and the setup screen. */
fun glassesSummary(state: GlassesState): String =
    when {
      !state.initialized -> "Glasses: waiting for Bluetooth permission"
      state.camera == CameraStatus.ON ->
          if (state.usingMock) "Phone camera on (simulated glasses)" else "Glasses camera on"
      state.usingMock -> "Simulated glasses ready"
      !state.isRegistered -> "Glasses not connected to Bhavya yet"
      !state.hasDevice -> "Glasses not found. Are they on and paired?"
      else -> "Glasses ready"
    }
