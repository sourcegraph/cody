@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class AutocompleteItem(
  val id: String,
  val insertText: String,
  val range: Range,
)

