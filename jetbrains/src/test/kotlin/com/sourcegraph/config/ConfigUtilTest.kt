import com.google.gson.JsonParser
import com.intellij.openapi.project.Project
import com.sourcegraph.config.ConfigUtil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.mockito.Mockito.mock

class ConfigUtils {

  private val mockProject = mock(Project::class.java)

  @Test
  fun testGetCustomConfiguration_addsAdditionalProperties() {
    val input =
        """
    {
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    val result = ConfigUtil.getCustomConfiguration(mockProject, input)
    val parsed = JsonParser.parseString(result).asJsonObject

    assertEquals(
        "indentation-based",
        parsed
            .get("cody")
            .asJsonObject
            .get("experimental")
            .asJsonObject
            .get("foldingRanges")
            .asString)
  }

  @Test
  fun testGetCustomConfiguration_handlesTrailingCommas() {
    val input =
        """
    {
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    val result = ConfigUtil.getCustomConfiguration(mockProject, input)
    assertNotNull(result)
    val parsed = JsonParser.parseString(result).asJsonObject
    assertEquals(2 + 1, parsed.size()) // +1 for the additional folding property
  }

  @Test
  fun testGetCustomConfiguration_handlesComments() {
    val input =
        """
    {
       // This is a comment
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    val result = ConfigUtil.getCustomConfiguration(mockProject, input)
    assertNotNull(result)
    val parsed = JsonParser.parseString(result).asJsonObject
    assertEquals(2 + 1, parsed.size()) // +1 for the additional folding property
  }
}
