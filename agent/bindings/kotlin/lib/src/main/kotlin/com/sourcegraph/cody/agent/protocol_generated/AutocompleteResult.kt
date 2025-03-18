@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AutocompleteResult(
  val items: List<AutocompleteCompletionItem>,
  val inlineCompletionItems: List<AutocompleteCompletionItem>,
  val decoratedEditItems: List<AutocompleteEditItem>,
  val completionEvent: CompletionBookkeepingEvent? = null,
)

