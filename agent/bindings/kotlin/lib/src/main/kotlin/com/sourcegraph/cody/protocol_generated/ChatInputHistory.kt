@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ChatInputHistory(
  var inputText: String? = null,
  var inputContextFiles: List<ContextFile>? = null,
)

