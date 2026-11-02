package ai.bhavya.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HubUrlTest {
  @Test
  fun `adds http and drops paths and trailing slashes`() {
    assertEquals("http://192.168.1.8:8787", normalizeHubUrl(" 192.168.1.8:8787/ "))
    assertEquals("http://192.168.1.8:5173", normalizeHubUrl("http://192.168.1.8:5173/child"))
    assertEquals("https://hub.local", normalizeHubUrl("HTTPS://hub.local/"))
  }

  @Test
  fun `rejects text that is not a web address`() {
    assertNull(normalizeHubUrl(""))
    assertNull(normalizeHubUrl("   "))
    assertNull(normalizeHubUrl("ftp://192.168.1.8"))
    assertNull(normalizeHubUrl("http://"))
    assertNull(normalizeHubUrl("not a url"))
  }

  @Test
  fun `only pages on the hub count as hub pages`() {
    val hub = "http://192.168.1.8:8787"
    assertTrue(isHubPage("http://192.168.1.8:8787/child", hub))
    assertTrue(isHubPage("http://192.168.1.8:8787/cards/a.png", hub))
    assertFalse(isHubPage("http://192.168.1.8:9999/child", hub))
    assertFalse(isHubPage("https://example.com/", hub))
    assertFalse(isHubPage("javascript:alert(1)", hub))
  }
}
