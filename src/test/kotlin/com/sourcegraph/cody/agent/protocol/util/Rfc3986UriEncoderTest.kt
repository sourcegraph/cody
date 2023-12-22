package com.sourcegraph.cody.agent.protocol.util

import junit.framework.TestCase

class Rfc3986UriEncoderTest : TestCase() {

  fun `test encode Windows path`() {
    val fixedUri = Rfc3986UriEncoder.encode("file:///C:/Users/user/Test.java")
    assertEquals("file:///c%3A/Users/user/Test.java", fixedUri)
  }

  fun `test encode Windows path with lowercase partition`() {
    val fixedUri = Rfc3986UriEncoder.encode("file:///c:/Users/user/Test.java")
    assertEquals("file:///c%3A/Users/user/Test.java", fixedUri)
  }

  fun `test encode Linux path`() {
    val uri = Rfc3986UriEncoder.encode("file:///home/user/Test.java")
    assertEquals("file:///home/user/Test.java", uri)
  }
}
