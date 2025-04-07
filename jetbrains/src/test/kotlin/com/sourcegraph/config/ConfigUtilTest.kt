import com.google.gson.JsonParser
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.io.readText
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import kotlin.test.assertContains

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
    assertEquals(
        2 + 2,
        parsed
            .getAsJsonObject("cody")
            .size()) // +2 for the additional folding property and productCode
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
    assertEquals(
        2 + 2,
        parsed
            .getAsJsonObject("cody")
            .size()) // +2 for the additional folding property and productCode
  }

  fun testAddSettings_addASetting() {

    val input =
        """
    {

    }
    """
    setCodySettingsJsonContent(input)
    ConfigUtil.addSettings(project, mapOf("cody.suggestions.mode" to "auto-edit (Beta)"))

    val result = ConfigUtil.getSettingsFile(project).readText()
    assertContains(result, "auto-edit (Beta)")
  }

  fun testAddSettings_overrideASetting() {
    val input =
        """
    {
       // This is a comment
      "cody.debug": true,
      "cody.suggestions.mode": "autocomplete"
    }
    """
    setCodySettingsJsonContent(input)
    ConfigUtil.addSettings(project, mapOf("cody.suggestions.mode" to "auto-edit (Beta)"))

    val result = ConfigUtil.getSettingsFile(project).readText()
    assertContains(result, "auto-edit (Beta)")
    assertFalse(result.contains("autocomplete"))
  }

  fun testAddSettings_persistExistingSettings() {
    val input =
        """
    {
       // This is a comment
      "cody.debug": true,
    }
    """
    setCodySettingsJsonContent(input)
    ConfigUtil.addSettings(project, mapOf("cody.suggestions.mode" to "auto-edit (Beta)"))

    val result = ConfigUtil.getSettingsFile(project).readText()
    assertContains(result, "auto-edit (Beta)")
  }

  private fun setCodySettingsJsonContent(codySettingsContent: String) {
    val uriString = ConfigUtil.getSettingsFile(project).toUri().toString()
    CodyEditorUtil.createFileOrScratchFromUntitled(project, uriString, codySettingsContent)
  }
}
