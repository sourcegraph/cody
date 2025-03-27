package com.sourcegraph.cody.autocomplete

import com.intellij.openapi.application.ReadAction
import com.sourcegraph.cody.autocomplete.AutocompleteEditTest.Companion.fixture
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind

open class BaseAutocompleteTest {

  protected fun triggerAutocomplete() {
    ReadAction.run<Throwable> {
      CodyAutocompleteManager.instance.triggerAutocomplete(
          fixture.editor, fixture.editor.caretModel.offset, InlineCompletionTriggerKind.INVOKE)
    }
  }
}
