package ai.bhavya.companion.glasses

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class I420Test {
  @Test
  fun `computes frame sizes, rounding chroma up for odd sizes`() {
    assertEquals(504 * 896 * 3 / 2, I420.frameSize(504, 896))
    assertEquals(9 + 2 * 4, I420.frameSize(3, 3))
  }

  @Test
  fun `converts I420 to NV21 by interleaving V then U`() {
    // 4x2 frame: 8 Y bytes, then 2 U bytes, then 2 V bytes.
    val y = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
    val u = byteArrayOf(10, 11)
    val v = byteArrayOf(20, 21)
    val nv21 = I420.toNv21(y + u + v, width = 4, height = 2)
    assertArrayEquals(y + byteArrayOf(20, 10, 21, 11), nv21)
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects buffers that are too small`() {
    I420.toNv21(ByteArray(10), width = 4, height = 4)
  }
}
