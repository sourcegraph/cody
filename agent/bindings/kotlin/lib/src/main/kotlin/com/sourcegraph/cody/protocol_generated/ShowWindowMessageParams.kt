@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ShowWindowMessageParams(
  val severity: SeverityEnum? = null, // Oneof: error, warning, information
  val message: String? = null,
  val options: MessageOptions? = null,
  val items: List<String>? = null,
)

