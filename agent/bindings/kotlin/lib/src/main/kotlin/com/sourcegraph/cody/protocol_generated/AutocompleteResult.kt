@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

data class AutocompleteResult(
  val items: List<AutocompleteItem>? = null,
  val completionEvent: CompletionBookkeepingEvent? = null,
)

