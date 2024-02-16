@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class DisplayCodeLensParams(
  var uri: String? = null,
  var codeLenses: List<ProtocolCodeLens>? = null,
)

