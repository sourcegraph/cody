import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager.Companion.trimCommonPrefixAndSuffix
import org.junit.Test

class CodyAutocompleteManagerTest : BasePlatformTestCase() {

  @Test
  fun testTrimCommonPrefixAndSuffix_NoCommonParts() {
    val formatted = "Hello, World!"
    val original = "Goodbye, Universe?"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(0, startIndex)
    assertEquals("Hello, World!", result)
  }

  @Test
  fun testTrimCommonPrefixAndSuffix_CommonPrefix() {
    val formatted = "Hello, World!"
    val original = "Hello, Universe?"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(7, startIndex)
    assertEquals("World!", result)
  }

  @Test
  fun testTrimCommonPrefixAndSuffix_CommonSuffix() {
    val formatted = "Hello, World!"
    val original = "Goodbye, World!"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(0, startIndex)
    assertEquals("Hello", result)
  }

  @Test
  fun testTrimCommonPrefixAndSuffix_CommonPrefixAndSuffix() {
    val formatted = "Hello, beautiful World!"
    val original = "Hello, amazing World!"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(7, startIndex)
    assertEquals("beautiful", result)
  }

  @Test
  fun testTrimCommonPrefixAndSuffix_EmptyStrings() {
    val formatted = ""
    val original = ""
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(0, startIndex)
    assertEquals("", result)
  }

  @Test
  fun testTrimCommonPrefixAndSuffix_FormattedShorterThanOriginal() {
    val formatted = "Hello"
    val original = "Hello, World!"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(5, startIndex)
    assertEquals("", result)
  }
}
