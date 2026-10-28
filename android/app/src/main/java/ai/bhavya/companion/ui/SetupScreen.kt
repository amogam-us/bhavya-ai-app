package ai.bhavya.companion.ui

import ai.bhavya.companion.glasses.GlassesState
import ai.bhavya.companion.normalizeHubUrl
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/** Parent-facing setup: where the home hub is, and which glasses to use. */
@Composable
fun SetupScreen(
    initialHubUrl: String?,
    initialMock: Boolean,
    glasses: GlassesState,
    permissionsGranted: Boolean,
    onRequestPermissions: () -> Unit,
    onConnectGlasses: () -> Unit,
    onAllowGlassesCamera: () -> Unit,
    onMockChanged: (Boolean) -> Unit,
    onSave: (hubUrl: String) -> Unit,
) {
  var address by rememberSaveable { mutableStateOf(initialHubUrl.orEmpty()) }
  var mock by rememberSaveable { mutableStateOf(initialMock) }
  var showAddressError by rememberSaveable { mutableStateOf(false) }
  val normalized = normalizeHubUrl(address)

  Column(
      modifier =
          Modifier.fillMaxSize()
              .systemBarsPadding()
              .imePadding()
              .verticalScroll(rememberScrollState())
              .padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text("Bhavya setup", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Text(
        "For parents. Your child will see the Bhavya child app after this.",
        style = MaterialTheme.typography.bodyMedium,
    )

    SetupCard(title = "Home hub") {
      OutlinedTextField(
          value = address,
          onValueChange = {
            address = it
            showAddressError = false
          },
          label = { Text("Hub address") },
          placeholder = { Text("http://192.168.1.8:8787") },
          singleLine = true,
          isError = showAddressError,
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
          modifier = Modifier.fillMaxWidth(),
      )
      Text(
          if (showAddressError) "Enter an address like http://192.168.1.8:8787."
          else "Shown in the hub's log when it starts. The phone must be on the same Wi-Fi.",
          style = MaterialTheme.typography.bodySmall,
          color =
              if (showAddressError) MaterialTheme.colorScheme.error
              else MaterialTheme.colorScheme.onSurface,
      )
    }

    SetupCard(title = "Glasses") {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          Text("Simulated glasses", fontWeight = FontWeight.SemiBold)
          Text(
              "Use this phone's camera instead of real glasses.",
              style = MaterialTheme.typography.bodySmall,
          )
        }
        Switch(
            checked = mock,
            onCheckedChange = {
              mock = it
              onMockChanged(it)
            },
        )
      }
      Text(glassesSummary(glasses), style = MaterialTheme.typography.bodyMedium)
      glasses.message?.let { Text(it, color = MaterialTheme.colorScheme.error) }

      if (!permissionsGranted) {
        OutlinedButton(onClick = onRequestPermissions) { Text("Allow Bluetooth and camera") }
      } else if (!mock && !glasses.isRegistered) {
        OutlinedButton(onClick = onConnectGlasses) { Text("Connect glasses (opens Meta AI)") }
      } else if (!mock) {
        OutlinedButton(onClick = onAllowGlassesCamera) { Text("Allow the glasses camera") }
      }
      if (!mock) {
        Text(
            "Real glasses need the Meta AI app with Developer Mode turned on.",
            style = MaterialTheme.typography.bodySmall,
        )
      }
    }

    Spacer(Modifier.padding(4.dp))
    Button(
        onClick = {
          if (normalized == null) showAddressError = true else onSave(normalized)
        },
        modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Open the child app")
    }
  }
}

@Composable
private fun SetupCard(title: String, content: @Composable () -> Unit) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
      content()
    }
  }
}
