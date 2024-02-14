@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ChatMessage(
  var speaker: String? = null, // Oneof: human, assistant
  var text: String? = null,
  var displayText: String? = null,
  var contextFiles: List<ContextFile>? = null,
  var preciseContext: List<PreciseContext>? = null,
  var buttons: List<ChatButton>? = null,
  var data: Any? = null,
  var metadata: ChatMetadata? = null,
  var error: ChatError? = null,
)

