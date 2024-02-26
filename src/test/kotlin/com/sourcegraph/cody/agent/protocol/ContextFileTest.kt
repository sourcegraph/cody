package com.sourcegraph.cody.agent.protocol

import java.net.URI
import junit.framework.TestCase

class ContextFileTest : TestCase() {
  private val localContextFileFile =
      ContextFileFile(
          uri =
              URI(
                  "file:///Users/mkondratek/runIdeProjects/jetbrains/src/main/java/com/sourcegraph/cody/agent/CodyAgentClient.java?#"),
          repoName = null,
          revision = null,
          range = Range(Position(83, 11), Position(83, 22)),
      )
  private val remoteContextFileFile =
      ContextFileFile(
          uri =
              URI(
                  "https://sourcegraph.sourcegraph.com//github.com/sourcegraph/jetbrains@8229d82c29fd52eda812f182741a3a0bfc1a547e/-/blob/TESTING.md?L49-56"),
          repoName = "github.com/sourcegraph/jetbrains",
          revision = "8229d82c29fd52eda812f182741a3a0bfc1a547e",
          range = Range(Position(48, 0), Position(56, 0)),
      )

  private val projectPath = "/Users/mkondratek/runIdeProjects/jetbrains/"

  fun `testGetLinkActionText - local file`() {
    val linkActionText = localContextFileFile.getLinkActionText(projectPath)
    assertEquals(
        "@src/main/java/com/sourcegraph/cody/agent/CodyAgentClient.java:84", linkActionText)
  }

  fun `testGetLinkActionText - remote file`() {
    val linkActionText = remoteContextFileFile.getLinkActionText(projectPath = null)
    assertEquals("jetbrains TESTING.md:49-56", linkActionText)
  }
}
