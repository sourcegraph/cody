package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.util.SystemInfoRt
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.net.URI

class ContextItemTest : BasePlatformTestCase() {
  private val localContextItemFile =
      ContextItemFile(
          uri =
              URI(
                  "file:///Users/mkondratek/runIdeProjects/jetbrains/src/main/java/com/sourcegraph/cody/agent/CodyAgentClient.java?#"),
          repoName = null,
          revision = null,
          range = Range(Position(83, 11), Position(83, 22)),
      )
  private val remoteContextItemFile =
      ContextItemFile(
          uri =
              URI(
                  "https://sourcegraph.sourcegraph.com//github.com/sourcegraph/jetbrains@8229d82c29fd52eda812f182741a3a0bfc1a547e/-/blob/TESTING.md?L49-56"),
          repoName = "github.com/sourcegraph/jetbrains",
          revision = "8229d82c29fd52eda812f182741a3a0bfc1a547e",
          range = Range(Position(48, 0), Position(56, 0)),
      )

  private val projectPath = "/Users/mkondratek/runIdeProjects/jetbrains/"

  fun `testGetLinkActionText - local file`() {
    val linkActionText = localContextItemFile.getLinkActionText(projectPath)
    assertEquals(
        "@src/main/java/com/sourcegraph/cody/agent/CodyAgentClient.java:84", linkActionText)
  }

  fun `testGetLinkActionText - remote file`() {
    val linkActionText = remoteContextItemFile.getLinkActionText(projectPath = null)
    assertEquals("jetbrains TESTING.md:49-56", linkActionText)
  }

  fun `test getPath`() {
    fun contextFilePath(path: String) = ContextItemFile(uri = URI.create(path)).getPath().toString()

    if (SystemInfoRt.isWindows) {
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("file:///c:/a/b/c/d.java"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("file://c:/a/b/c/d.java"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("file:///c:/a/b/c/d.java?#"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("file://c:/a/b/c/d.java?#"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("/c:/a/b/c/d.java"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("c:/a/b/c/d.java"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("c:/a/b/c/d.java?#"))
      assertEquals("c:\\a\\b\\c\\d.java", contextFilePath("c:/a/b/c/d.java?#"))
    } else {
      assertEquals("/a/b/c/d.java", contextFilePath("/a/b/c/d.java"))
      assertEquals("/a/b/c/d.java", contextFilePath("/a/b/c/d.java?#"))
      assertEquals("/a/b/c/d.java", contextFilePath("file:///a/b/c/d.java"))
    }
  }
}
