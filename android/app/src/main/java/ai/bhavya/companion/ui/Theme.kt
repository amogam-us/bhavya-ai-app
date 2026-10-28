package ai.bhavya.companion.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Same calm palette as the child web app. */
private val BhavyaColors =
    lightColorScheme(
        primary = Color(0xFF2F6F73),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFE3F1F1),
        onPrimaryContainer = Color(0xFF173436),
        background = Color(0xFFEEF5F4),
        onBackground = Color(0xFF173436),
        surface = Color.White,
        onSurface = Color(0xFF1C2530),
        error = Color(0xFFB42727),
    )

@Composable
fun BhavyaTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = BhavyaColors, content = content)
}
