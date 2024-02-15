@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class AutocompleteResult(
  var items: List<AutocompleteItem>? = null,
  var completionEvent: CompletionBookkeepingEvent? = null,
)

