@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CustomCommandResult(
  val type: TypeEnum? = null, // Oneof: edit, chat
  val chatResult: String? = null,
  val editResult: EditTask? = null,
)

