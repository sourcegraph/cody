@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ProtocolTextDocument(
  var uri: String? = null,
  var filePath: String? = null,
  var content: String? = null,
  var selection: Range? = null,
)

