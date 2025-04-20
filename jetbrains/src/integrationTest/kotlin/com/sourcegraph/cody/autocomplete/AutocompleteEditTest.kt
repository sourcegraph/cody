package com.sourcegraph.cody.autocomplete

import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem
import com.sourcegraph.cody.autoedit.AutoeditManager
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.util.BaseIntegrationTextFixture
import com.sourcegraph.cody.util.CustomJunitClassRunner
import com.sourcegraph.cody.util.TestingCredentials
import kotlin.test.assertNull
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(CustomJunitClassRunner::class)
class AutocompleteEditTest : BaseAutocompleteTest() {

  companion object {
    private val codySettingsContent =
        """{
          |  "cody.suggestions.mode": "auto-edit"
          |}
          |"""
            .trimMargin()

    private val fixture =
        BaseIntegrationTextFixture(
            recordingName = "autocompleteEdit",
            credentials = TestingCredentials.enterprise,
            CodyAgentService.clientCapabilities,
            codySettingsContent)

    @JvmStatic
    @BeforeClass
    fun setup() {
      CodyApplicationSettings.instance.isCodyAutocompleteEnabled = false
    }

    @JvmStatic
    @AfterClass
    fun shutdown() {
      fixture.shutdown()
    }
  }

  @Test
  fun forLoop() {
    fixture.openFile(relativeFilePath = "autocompleteEdit/src/main/kotlin/ForLoop.kt")
    fixture.triggerAutocomplete()
    awaitForAutoedit()

    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(
        fixture.editor.document.text,
        Matchers.equalTo(
            """fun main() {
                      |    val list = listOf(1, 2, 3, 4, 5)
                      |    for (item in list) {
                      |        println(item)
                      |    }
                      |}
                      |"""
                .trimMargin()))

    assertNull(AutoeditManager.getInstance(fixture.project).activeAutocompleteEditItem)
  }

  @Test
  fun debugStyles() {
    fixture.openFile(relativeFilePath = "autocompleteEdit/src/main/js/debug-styles.ts")
    fixture.triggerAutocomplete()
    awaitForAutoedit()

    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(
        fixture.editor.document.text,
        Matchers.equalTo(
            """const debug = new Debug(document.body, {
                |    dataStyles: {
                |        position: 'fixed',
                |        top: '10px',
                |        left: '10px',
                |        zIndex: '1000',
                |        color: '#fff',
                |        backgroundColor: 'var(--color-overlay)',
                |        padding: '8px',
                |        fontSize: '12px',
                |        border: '2px solid var(--color-text-primary)',
                |    },
                |});
                |"""
                .trimMargin()))

    assertNull(AutoeditManager.getInstance(fixture.project).activeAutocompleteEditItem)
  }

  private fun awaitForAutoedit(): AutocompleteEditItem {
    var attempts = 0
    val maxAttempts = 15

    while (attempts < maxAttempts) {
      val autoeditItem = AutoeditManager.getInstance(fixture.project).activeAutocompleteEditItem

      if (autoeditItem != null) return autoeditItem
      Thread.sleep(300)
      attempts++
    }
    throw AssertionError(
        "Awaiting successful autoedit: No active autoedit found after $maxAttempts attempts")
  }
}
