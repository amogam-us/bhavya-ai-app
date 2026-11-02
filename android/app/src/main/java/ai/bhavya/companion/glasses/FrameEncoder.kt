package ai.bhavya.companion.glasses

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Base64
import java.io.ByteArrayOutputStream

/** Encodes glasses frames as JPEG data URLs, the format the hub's vision endpoints accept. */
object FrameEncoder {
  private const val JPEG_QUALITY = 72

  fun toJpegDataUrl(frame: RawFrame): String {
    val nv21 = I420.toNv21(frame.bytes, frame.width, frame.height)
    val jpeg = ByteArrayOutputStream()
    YuvImage(nv21, ImageFormat.NV21, frame.width, frame.height, null)
        .compressToJpeg(Rect(0, 0, frame.width, frame.height), JPEG_QUALITY, jpeg)
    return "data:image/jpeg;base64," + Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP)
  }
}
