package com.sourcegraph.cody.autocomplete

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.VisualPosition
import com.intellij.testFramework.runInEdtAndGet
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities
import com.sourcegraph.cody.autocomplete.render.CodyAutocompleteElementRenderer
import com.sourcegraph.cody.autocomplete.render.InlayModelUtil
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.util.BaseIntegrationTextFixture
import com.sourcegraph.cody.util.CustomJunitClassRunner
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.AfterClass
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(CustomJunitClassRunner::class)
class AutocompleteCompletionTest {

  companion object {
    val fixture =
        BaseIntegrationTextFixture(
            "autocomplete",
            CodyAgentService.clientCapabilities.copy(
                globalState = ClientCapabilities.GlobalStateEnum.Stateless))

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
    fixture.openFile(relativeFilePath = "autocompleteCompletion/src/main/kotlin/ForLoop.kt")
    triggerAutocomplete()

    awaitForInlayRenderer()
    assertTrue(hasInlayAt(VisualPosition(2, 9)))

    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(fixture.editor.document.text, containsString("\n    for (x in list) {\n"))
  }

  @Test
  fun todoComment() {
    fixture.openFile(relativeFilePath = "autocompleteCompletion/src/main/kotlin/TodoComment.kt")
    triggerAutocomplete()

    awaitForInlayRenderer()
    assertTrue(hasInlayAt(VisualPosition(3, 23)))
    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(
        fixture.editor.document.text,
        containsString("\n    // todo: calculate the result vector\n"))
  }

  @Test
  fun commonPrefix() {
    fixture.openFile(relativeFilePath = "autocompleteCompletion/src/main/kotlin/CommonPrefix.kt")
    triggerAutocomplete()

    awaitForInlayRenderer()
    assertTrue(hasInlayAt(VisualPosition(8, 4 + 13))) // +13 due to the common prefix
    fixture.triggerAction("cody.acceptAutocompleteAction")
    assertThat(
        fixture.editor.document.text, containsString("\n    CommonPrefix.sayHello(\"world\")\n"))
  }

  private fun hasInlayAt(position: VisualPosition) = runInEdtAndGet {
    fixture.editor.inlayModel.hasInlineElementAt(position)
  }

  private fun triggerAutocomplete() {
    ReadAction.run<Throwable> {
      CodyAutocompleteManager.instance.triggerAutocomplete(
          fixture.editor, fixture.editor.caretModel.offset, InlineCompletionTriggerKind.INVOKE)
    }
  }

  private fun awaitForInlayRenderer() {
    var attempts = 0
    val maxAttempts = 15

    while (attempts < maxAttempts) {
      val renderers =
          InlayModelUtil.getAllInlaysForEditor(fixture.editor)
              .map { it.renderer }
              .filterIsInstance<CodyAutocompleteElementRenderer>()

      if (renderers.size == 1) break
      Thread.sleep(300)
      attempts++
    }
    if (attempts >= maxAttempts) {
      fail("Awaiting successful completion: No inlay renderer found after $maxAttempts attempts")
    }
  }
}
