package utils

import com.sourcegraph.utils.CodyEditorUtil
import junit.framework.TestCase.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class CodyEditorUtilTest(private val uri: String, private val expectedUri: String) {

  @Test
  fun canFixUriPath() {
    val result = CodyEditorUtil.fixUriString(uri)

    assertEquals(expectedUri, result)
  }

  companion object {
    @JvmStatic
    @Parameterized.Parameters
    fun data(): Collection<Array<Any>> {
      return listOf(
          arrayOf(
              "C:%5Cdev%5CJetbrainsTestsProjects%5CValidate.kt",
              "file://C:%5Cdev%5CJetbrainsTestsProjects%5CValidate.kt"),
          arrayOf(
              "file://C:%5Cdev%5CJetbrainsTestsProjects%5Ckotlin%5CTestProject%5CValidate.kt",
              "file://C:%5Cdev%5CJetbrainsTestsProjects%5Ckotlin%5CTestProject%5CValidate.kt"),
          arrayOf(
              "untitled://Whatever/path/it/has/MyScratchFile.kt",
              "Whatever/path/it/has/MyScratchFile.kt"),
          arrayOf(
              "file://wsl.localhost/ubuntu/home/user/project/main.py",
              "file:////wsl.localhost/ubuntu/home/user/project/main.py"),
          arrayOf(
              "file:////wsl.localhost/debian/etc/hosts", "file:////wsl.localhost/debian/etc/hosts"),
          // Unix-like paths needing prefix
          arrayOf("/home/user/my_code.go", "file:///home/user/my_code.go"),
          arrayOf("file:///usr/local/bin/script.sh", "file:///usr/local/bin/script.sh"),
      )
    }
  }
}
