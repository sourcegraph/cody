import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.error.CodyErrorSubmitter

class CodyErrorSubmitterTest : BasePlatformTestCase() {

  private val codyErrorSubmitter = CodyErrorSubmitter()

  fun testGetEncodedUrlWithNullProject() {
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null)
    assertTrue(
        encodedUrl.startsWith(
            "https://github.com/sourcegraph/jetbrains/issues/new?template=bug_report.yml"))
    assertTrue(encodedUrl.contains("&labels=bug,repo/jetbrains"))
    assertTrue(encodedUrl.contains("&projects=sourcegraph/381"))
    assertFalse(encodedUrl.contains("&title="))
  }

  fun testGetEncodedUrlWithThrowableText() {
    val throwableText = "NullPointerException: Something went wrong"
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null, throwableText)
    assertTrue(encodedUrl.contains("&title=bug%3A+NullPointerException%3A+Something+went+wrong"))
  }

  fun testGetEncodedUrlWithAdditionalInfo() {
    val additionalInfo = "Additional debug information"
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null, null, additionalInfo)
    assertTrue(
        encodedUrl.contains("&logs=Additional+info%3A+%60%60%60Additional+debug+information"))
  }

  fun testGetEncodedUrlWithProjectAndThrowableText() {
    val throwableText = "IllegalArgumentException: Invalid input"
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(project, throwableText)
    assertTrue(encodedUrl.contains("&title=bug%3A+IllegalArgumentException%3A+Invalid+input"))
    assertTrue(encodedUrl.contains("&about="))
  }

  fun testGetEncodedUrlMaxLength() {
    val longThrowableText = "A".repeat(10000)
    val longAdditionalInfo = "B".repeat(10000)
    val encodedUrl = codyErrorSubmitter.getEncodedUrl(null, longThrowableText, longAdditionalInfo)
    assertTrue(encodedUrl.length <= CodyErrorSubmitter.MAX_URL_LENGTH)
  }
}
