@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

data class TextDocumentEditParams(
  val uri: String? = null,
  val edits: List<TextEdit>? = null,
  val options: OptionsParams? = null,
)

