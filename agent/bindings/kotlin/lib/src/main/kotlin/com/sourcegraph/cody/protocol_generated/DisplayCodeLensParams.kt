@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class DisplayCodeLensParams(
  val uri: String? = null,
  val codeLenses: List<ProtocolCodeLens>? = null,
)

