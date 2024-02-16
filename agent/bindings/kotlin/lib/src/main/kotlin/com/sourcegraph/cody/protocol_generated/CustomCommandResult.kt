@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CustomCommandResult(
  var type: String? = null, // Oneof: edit, chat
  var chatResult: String? = null,
  var editResult: EditTask? = null,
)

