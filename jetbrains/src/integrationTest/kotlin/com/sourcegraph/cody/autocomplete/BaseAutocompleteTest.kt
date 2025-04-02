package com.sourcegraph.cody.autocomplete

import com.intellij.openapi.application.ReadAction
import com.sourcegraph.cody.util.BaseIntegrationTextFixture
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind

open class BaseAutocompleteTest {

  protected fun BaseIntegrationTextFixture.triggerAutocomplete() {
    ReadAction.run<Throwable> {
      CodyAutocompleteManager.instance.triggerAutocomplete(
          editor, editor.caretModel.offset, InlineCompletionTriggerKind.INVOKE)
    }
  }
}
