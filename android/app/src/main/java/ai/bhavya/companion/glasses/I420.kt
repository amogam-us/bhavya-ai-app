package ai.bhavya.companion.glasses

/** A decoded glasses camera frame in tightly packed I420 (Y plane, then U, then V). */
class RawFrame(val bytes: ByteArray, val width: Int, val height: Int)

/** Pure YUV helpers, kept free of Android classes so they can be unit tested. */
object I420 {
  fun chromaSize(width: Int, height: Int): Int = ((width + 1) / 2) * ((height + 1) / 2)

  fun frameSize(width: Int, height: Int): Int = width * height + 2 * chromaSize(width, height)

  /**
   * Converts I420 to NV21 (Y plane, then interleaved V and U), the layout Android's YuvImage
   * can compress to JPEG.
   */
  fun toNv21(i420: ByteArray, width: Int, height: Int): ByteArray {
    val ySize = width * height
    val chroma = chromaSize(width, height)
    require(i420.size >= ySize + 2 * chroma) {
      "Frame has ${i420.size} bytes; ${width}x$height I420 needs ${ySize + 2 * chroma}."
    }
    val nv21 = ByteArray(ySize + 2 * chroma)
    System.arraycopy(i420, 0, nv21, 0, ySize)
    val uStart = ySize
    val vStart = ySize + chroma
    var out = ySize
    for (i in 0 until chroma) {
      nv21[out++] = i420[vStart + i]
      nv21[out++] = i420[uStart + i]
    }
    return nv21
  }
}
