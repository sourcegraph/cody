package com.sourcegraph.cody.config

import com.sourcegraph.config.ConfigUtil
import junit.framework.TestCase

class SourcegraphServerPathTest : TestCase() {

  fun `test path for dotcom`() {
    val path = SourcegraphServerPath.from(ConfigUtil.DOTCOM_URL, "")
    assertEquals("https://sourcegraph.com/", path.url)
  }

  fun `test path with extra slash postfix`() {
    val path = SourcegraphServerPath.from("https://sourcegraph.com", "")
    assertEquals("https://sourcegraph.com/", path.url)
  }

  fun `test path with https prefix`() {
    val path = SourcegraphServerPath.from("sourcegraph.com", "")
    assertEquals("https://sourcegraph.com/", path.url)
  }

  fun `test path with port`() {
    val path = SourcegraphServerPath.from("sourcegraph.com:80", "")
    assertEquals("https://sourcegraph.com:80/", path.url)
  }

  fun `test path with additional path segments`() {
    val path = SourcegraphServerPath.from("sourcegraph.com:80/some/path", "")
    assertEquals("https://sourcegraph.com:80/some/path/", path.url)
  }
}
