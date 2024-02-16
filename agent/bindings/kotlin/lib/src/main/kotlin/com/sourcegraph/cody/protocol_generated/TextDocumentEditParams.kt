@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class TextDocumentEditParams(
  var uri: String? = null,
  var edits: List<TextEdit>? = null,
  var options: OptionsParams? = null,
)

