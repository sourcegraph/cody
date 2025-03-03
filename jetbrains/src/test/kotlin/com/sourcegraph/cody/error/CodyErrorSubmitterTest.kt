import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.error.CodyErrorSubmitter
import java.net.URLDecoder

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
        encodedUrl.contains(
            "&logs=Additional+info%3A%0A%60%60%60text%0AAdditional+debug+information"))
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

  fun testGetEncodedUrlMinimalStacktrace() {
    val longThrowableText = (1..1000).toList().joinToString("\n") { "Stack trace line $it" }
    val longAdditionalInfo = (1..1000).toList().joinToString("\n") { "Additional info line $it" }

    val longThrowableTextWithRelevantStacktrace =
        longThrowableText.replace("line 500\n", "com.sourcegraph.cody.ProblematicClass\n")

    val encodedUrl =
        codyErrorSubmitter.getEncodedUrl(
            null, longThrowableTextWithRelevantStacktrace, longAdditionalInfo)
    assertTrue(encodedUrl.length <= CodyErrorSubmitter.MAX_URL_LENGTH)

    val decodedUrl = URLDecoder.decode(encodedUrl, "utf-8")

    assertTrue(decodedUrl.contains("Additional info line 1"))
    assertTrue(decodedUrl.contains("Additional info line 276"))
    assertFalse(decodedUrl.contains("Additional info line 277"))

    assertFalse(decodedUrl.contains("Stack trace line 497"))
    assertTrue(decodedUrl.contains("Stack trace line 498"))
    assertTrue(decodedUrl.contains("Stack trace line 499"))
    assertTrue(decodedUrl.contains("Stack trace com.sourcegraph.cody.ProblematicClass"))
    assertTrue(decodedUrl.contains("Stack trace line 501"))
    assertTrue(decodedUrl.contains("Stack trace line 502"))
    assertFalse(decodedUrl.contains("Stack trace line 503"))
  }

  fun testGetEncodedUrlAdjustedStacktrace() {
    val longThrowableText = (1..200).toList().joinToString("\n") { "Stack trace line $it" }
    val longAdditionalInfo = (1..250).toList().joinToString("\n") { "Additional info line $it" }

    val longThrowableTextWithRelevantStacktrace =
        longThrowableText.replace("line 100\n", "com.sourcegraph.cody.ProblematicClass\n")

    val encodedUrl =
        codyErrorSubmitter.getEncodedUrl(
            null, longThrowableTextWithRelevantStacktrace, longAdditionalInfo)
    assertTrue(encodedUrl.length <= CodyErrorSubmitter.MAX_URL_LENGTH)

    val decodedUrl = URLDecoder.decode(encodedUrl, "utf-8")

    assertTrue(decodedUrl.contains("Additional info line 1"))
    assertTrue(decodedUrl.contains("Additional info line 250"))

    assertFalse(decodedUrl.contains("Stack trace line 82"))
    assertTrue(decodedUrl.contains("Stack trace line 83"))
    assertTrue(decodedUrl.contains("Stack trace com.sourcegraph.cody.ProblematicClass"))
    assertTrue(decodedUrl.contains("Stack trace line 117"))
    assertFalse(decodedUrl.contains("Stack trace line 118"))
  }
}
