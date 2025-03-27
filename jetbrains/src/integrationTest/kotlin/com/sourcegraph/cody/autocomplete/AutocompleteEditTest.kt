package com.sourcegraph.cody.autocomplete

import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem
import com.sourcegraph.cody.autocomplete.AutocompleteEditTest.Companion.fixture
import com.sourcegraph.cody.autoedit.AutoeditManager
import com.sourcegraph.cody.util.BaseIntegrationTextFixture
import com.sourcegraph.cody.util.CustomJunitClassRunner
import kotlin.test.assertNull
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers
import org.junit.AfterClass
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(CustomJunitClassRunner::class)
class AutocompleteEditTest : BaseAutocompleteTest() {

  companion object {
    val fixture = BaseIntegrationTextFixture("autocompleteEdit")

    @JvmStatic
    @AfterClass
    fun shutdown() {
      fixture.shutdown()
    }
  }

  @Test
  fun forLoop() {
    fixture.openFile(relativeFilePath = "autocompleteEdit/src/main/kotlin/ForLoop.kt")
    triggerAutocomplete()
    awaitForAutoedit()

    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(
        fixture.editor.document.text,
        Matchers.equalTo(
            """fun main() {
                      |val list = listOf(1, 2, 3, 4, 5)
                      |    for (i in list) {
                      |        println(i)
                      |    }
                      |}
                      |"""))

    assertNull(AutoeditManager.getInstance(fixture.project).activeAutocompleteEditItem)
  }

  @Test
  fun debugStyles() {
    fixture.openFile(relativeFilePath = "autocompleteEdit/src/main/js/debug-styles.ts")
    triggerAutocomplete()
    awaitForAutoedit()

    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(
        fixture.editor.document.text,
        Matchers.equalTo(
            """
                      | a joke
                      |"""))

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
