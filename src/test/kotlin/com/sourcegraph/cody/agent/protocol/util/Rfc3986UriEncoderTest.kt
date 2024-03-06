package com.sourcegraph.cody.agent.protocol.util

import junit.framework.TestCase

class Rfc3986UriEncoderTest : TestCase() {

  fun `test encode Windows path`() {
    val fixedUri = Rfc3986UriEncoder.encode("file:///C:/Users/user/Test.java")
    assertEquals("file:///c:/Users/user/Test.java", fixedUri)
  }

  fun `test encode Windows jar path`() {
    val uri = Rfc3986UriEncoder.encode("jar://C:/home/user/x.jar")
    assertEquals("jar://c:/home/user/x.jar", uri)
  }

  fun `test encode Windows path with lowercase partition`() {
    val fixedUri = Rfc3986UriEncoder.encode("file:///c:/Users/user/Test.java")
    assertEquals("file:///c:/Users/user/Test.java", fixedUri)
  }

  fun `test encode Linux path`() {
    val uri = Rfc3986UriEncoder.encode("file://home/user/Test.java")
    assertEquals("file://home/user/Test.java", uri)
  }
}
