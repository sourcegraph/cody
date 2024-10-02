package com.sourcegraph.cody.agent.protocol

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.intellij.openapi.util.SystemInfoRt
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.net.URI

class UriUtilsTest : BasePlatformTestCase() {
  fun `test uri serialization and deserialization`() {
    val gson: Gson =
        GsonBuilder()
            .registerTypeAdapter(URI::class.java, uriDeserializer)
            .registerTypeAdapter(URI::class.java, uriSerializer)
            .serializeNulls()
            .create()

    fun roundtripConversion(path: String) =
        gson.fromJson(gson.toJson(URI.create(path)), URI::class.java).toString()

    if (SystemInfoRt.isWindows) {
      assertEquals("file:/c:/a/b/c/d.java", roundtripConversion("file:///c:/a/b/c/d.java"))
      assertEquals("file://c:/a/b/c/d.java", roundtripConversion("file://c:/a/b/c/d.java"))
      assertEquals("file:/c:/a/b/c/d.java?#", roundtripConversion("file:///c:/a/b/c/d.java?#"))
      assertEquals("file://c:/a/b/c/d.java?#", roundtripConversion("file://c:/a/b/c/d.java?#"))
      assertEquals("/c:/a/b/c/d.java", roundtripConversion("/c:/a/b/c/d.java"))
      assertEquals("c:/a/b/c/d.java", roundtripConversion("c:/a/b/c/d.java"))
      assertEquals("c:/a/b/c/d.java?#", roundtripConversion("c:/a/b/c/d.java?#"))
      assertEquals("/c:/a/b/c/d.java?#", roundtripConversion("/c:/a/b/c/d.java?#"))
    } else {
      assertEquals("/a/b/c/d.java", roundtripConversion("/a/b/c/d.java"))
      assertEquals("/a/b/c/d.java?#", roundtripConversion("/a/b/c/d.java?#"))
      assertEquals("file:/a/b/c/d.java", roundtripConversion("file:///a/b/c/d.java"))
    }
  }
}
