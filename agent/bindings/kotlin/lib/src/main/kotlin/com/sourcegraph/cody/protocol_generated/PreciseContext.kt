@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class PreciseContext(
  var symbol: SymbolParams? = null,
  var hoverText: List<String>? = null,
  var definitionSnippet: String? = null,
  var filePath: String? = null,
  var range: RangeParams? = null,
)

