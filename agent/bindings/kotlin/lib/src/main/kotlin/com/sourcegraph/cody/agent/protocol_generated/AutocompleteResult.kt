@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AutocompleteResult(
  val items: List<AutocompleteItem>,
  val inlineCompletionItems: List<AutocompleteItem>,
  val decoratedEditItems: List<AutocompleteEditItem>,
  val completionEvent: CompletionBookkeepingEvent? = null,
)

