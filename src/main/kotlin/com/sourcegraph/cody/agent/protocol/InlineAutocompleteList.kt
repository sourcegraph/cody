package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.vscode.InlineAutocompleteItem

class InlineAutocompleteList {
  val items: List<InlineAutocompleteItem> = emptyList()
  val completionEvent: CompletionEvent? = null
}
