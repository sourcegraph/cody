@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class TextDocumentEditParams(
  val uri: String,
  val edits: List<TextEdit>,
  val options: OptionsParams? = null,
)

