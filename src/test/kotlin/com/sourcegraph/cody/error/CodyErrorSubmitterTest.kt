import com.intellij.openapi.project.Project
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.error.CodyErrorSubmitter
import org.junit.Test
import org.mockito.Mockito.mock

class CodyErrorSubmitterTest : BasePlatformTestCase() {

  private val codyErrorSubmitter = CodyErrorSubmitter()

  @Test
  fun testGetEncodedUrlWithNullProject() {
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null)
    assertTrue(
        encodedUrl.startsWith(
            "https://github.com/sourcegraph/jetbrains/issues/new?template=bug_report.yml"))
    assertTrue(encodedUrl.contains("&labels=bug,repo/jetbrains"))
    assertTrue(encodedUrl.contains("&projects=sourcegraph/381"))
    assertFalse(encodedUrl.contains("&title="))
  }

  @Test
  fun testGetEncodedUrlWithThrowableText() {
    val throwableText = "NullPointerException: Something went wrong"
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null, throwableText)
    assertTrue(encodedUrl.contains("&title=bug%3A+NullPointerException%3A+Something+went+wrong"))
  }

  @Test
  fun testGetEncodedUrlWithAdditionalInfo() {
    val additionalInfo = "Additional debug information"
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null, null, additionalInfo)
    assertTrue(
        encodedUrl.contains("&logs=Additional+info%3A+%60%60%60Additional+debug+information"))
  }

  @Test
  fun testGetEncodedUrlWithProjectAndThrowableText() {
    val mockProject = mock(Project::class.java)
    val throwableText = "IllegalArgumentException: Invalid input"
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(mockProject, throwableText)
    assertTrue(encodedUrl.contains("&title=bug%3A+IllegalArgumentException%3A+Invalid+input"))
    assertTrue(encodedUrl.contains("&about="))
  }

  @Test
  fun testGetEncodedUrlMaxLength() {
    val longThrowableText = "A".repeat(10000)
    val longAdditionalInfo = "B".repeat(10000)
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null, longThrowableText, longAdditionalInfo)
    assertTrue(encodedUrl.length <= CodyErrorSubmitter.MAX_URL_LENGTH)
  }
}
