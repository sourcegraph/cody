import com.google.gson.JsonParser
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil

class ConfigUtils : BasePlatformTestCase() {

  fun testGetCustomConfiguration_addsAdditionalProperties() {
    val input =
        """
    {
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    setCodySettingsJsonContent(input)
    val result = ConfigUtil.getCustomConfiguration(project)
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
    setCodySettingsJsonContent(input)
    val result = ConfigUtil.getCustomConfiguration(project)
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
    setCodySettingsJsonContent(input)
    val result = ConfigUtil.getCustomConfiguration(project)
    assertNotNull(result)
    val parsed = JsonParser.parseString(result).asJsonObject
    assertEquals(2 + 1, parsed.size()) // +1 for the additional folding property
  }

  private fun setCodySettingsJsonContent(codySettingsContent: String) {
    val uriString = ConfigUtil.getSettingsFile(project).toUri().toString()
    CodyEditorUtil.createFileOrScratchFromUntitled(project, uriString, codySettingsContent)
  }
}
