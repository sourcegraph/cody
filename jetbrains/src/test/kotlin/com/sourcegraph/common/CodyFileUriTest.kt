package com.sourcegraph.common

import junit.framework.TestCase.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class CodyFileUriTest(private val uri: String, private val expectedUri: String) {

  @Test
  fun `can parse uri from agent`() {
    val result = CodyFileUri.parse(uri, null)

    assertEquals(expectedUri, result.toString())
  }

  companion object {
    @JvmStatic
    @Parameterized.Parameters
    fun data(): Collection<Array<Any>> {
      return listOf(
          arrayOf(
              "C:%5Cdev%5CJetbrainsTestsProjects%5Ckotlin%5CTestProject%5CValidate.kt",
              "file:///C:/dev/JetbrainsTestsProjects/kotlin/TestProject/Validate.kt"),
          arrayOf(
              "C:\\dev\\JetbrainsTestsProjects\\kotlin\\TestProject\\Validate.kt",
              "file:///C:/dev/JetbrainsTestsProjects/kotlin/TestProject/Validate.kt"),
          arrayOf(
              "file:///c%3A/dev/JetbrainsTestsProjects/kotlin/TestProject/src/Main.kt",
              "file:///c:/dev/JetbrainsTestsProjects/kotlin/TestProject/src/Main.kt"),
          arrayOf(
              "file://c%3A/dev/JetbrainsTestsProjects/kotlin/TestProject/src/Main.kt",
              "file:///c:/dev/JetbrainsTestsProjects/kotlin/TestProject/src/Main.kt"),
          arrayOf("file:///c:/path/to/the%20file.txt", "file:///c:/path/to/the%20file.txt"),
          arrayOf(
              "untitled:/c%3A/dev/JetbrainsTestsProjects/kotlin/TestProject/src/test/kotlin/MainTest.kt",
              "file:///c:/dev/JetbrainsTestsProjects/kotlin/TestProject/src/test/kotlin/MainTest.kt"),
          arrayOf(
              "untitled:7a8ee217-5b34-45c7-9a6e-eaf694ed3abc.kotlin",
              "file:///7a8ee217-5b34-45c7-9a6e-eaf694ed3abc.kotlin"),
          arrayOf(
              "file:///Users/pk/Work/sourcegraph/cody/jetbrains/gradle.properties",
              "file:///Users/pk/Work/sourcegraph/cody/jetbrains/gradle.properties"),
          arrayOf("file://wsl.localhost/folder/file.cs", "file:////wsl.localhost/folder/file.cs"),
      )
    }
  }
}
