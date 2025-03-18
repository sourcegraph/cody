@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AutocompleteCompletionItem(
  val id: String,
  val range: Range,
  val insertText: String,
)

