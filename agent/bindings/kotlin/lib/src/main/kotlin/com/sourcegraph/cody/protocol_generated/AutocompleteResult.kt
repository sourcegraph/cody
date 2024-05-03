@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class AutocompleteResult(
  val items: List<AutocompleteItem>,
  val completionEvent: CompletionBookkeepingEvent? = null,
)

