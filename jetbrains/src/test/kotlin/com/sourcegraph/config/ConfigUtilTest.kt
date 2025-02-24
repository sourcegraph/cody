import com.google.gson.JsonParser
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.config.ConfigUtil

class ConfigUtils : BasePlatformTestCase() {

  fun testGetCustomConfiguration_addsAdditionalProperties() {
    val input =
        """
    {
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    val result = ConfigUtil.getCustomConfiguration(project, input)
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

  fun testGetCustomConfiguration_handlesTrailingCommas() {
    val input =
        """
    {
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    val result = ConfigUtil.getCustomConfiguration(project, input)
    assertNotNull(result)
    val parsed = JsonParser.parseString(result).asJsonObject
    assertEquals(2 + 1, parsed.size()) // +1 for the additional folding property
  }

  fun testGetCustomConfiguration_handlesComments() {
    val input =
        """
    {
       // This is a comment
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    val result = ConfigUtil.getCustomConfiguration(project, input)
    assertNotNull(result)
    val parsed = JsonParser.parseString(result).asJsonObject
    assertEquals(2 + 1, parsed.size()) // +1 for the additional folding property
  }
}
