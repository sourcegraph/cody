package com.sourcegraph.website

import com.intellij.testFramework.fixtures.BasePlatformTestCase

class URLBuilderTest : BasePlatformTestCase() {

  fun `test valid`() {
    val url =
        URLBuilder.buildCommitUrl(
            "https://www.sourcegraph.com",
            "1fa8d5d6286c24924b55c15ed4d1a0b85c44b4d5",
            "https://github.com/sourcegraph/sourcegraph-jetbrains.git",
            "intellij",
            "1.1")
    assertEquals(
        "https://www.sourcegraph.com/github.com/sourcegraph/sourcegraph-jetbrains.git/-/commit/1fa8d5d6286c24924b55c15ed4d1a0b85c44b4d5?" +
            "editor=JetBrains&" +
            "version=v5.2.1715-nightly&" +
            "utm_product_name=intellij&" +
            "utm_product_version=1.1",
        url)
  }

  fun `test missing base URI throws exception`() {
    val base = ""
    assertThrows(RuntimeException::class.java) {
      URLBuilder.buildCommitUrl(
          base,
          "1fa8d5d6286c24924b55c15ed4d1a0b85c44b4d5",
          "https://github.com/sourcegraph/sourcegraph-jetbrains.git",
          "intellij",
          "1.1")
    }
  }

  fun `test missing revision throws exception`() {
    val revision = ""
    assertThrows(RuntimeException::class.java) {
      URLBuilder.buildCommitUrl(
          "https://www.sourcegraph.com",
          revision,
          "https://github.com/sourcegraph/sourcegraph-jetbrains.git",
          "intellij",
          "1.1")
    }
  }

  fun `test missing remote URL throws exception`() {
    val remoteUrl = ""
    assertThrows(RuntimeException::class.java) {
      URLBuilder.buildCommitUrl(
          "https://www.sourcegraph.com",
          "1fa8d5d6286c24924b55c15ed4d1a0b85c44b4d5",
          remoteUrl,
          "intellij",
          "1.1")
    }
  }
}
