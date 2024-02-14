@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ChatMetadata(
  var source: ChatEventSource? = null, // Oneof: chat, editor, menu, sidebar, code-action:explain, code-action:document, code-action:edit, code-action:fix, code-action:generate, custom-commands, test, code-lens, explain, unit, smell, terminal, test, doc
  var requestID: String? = null,
  var chatModel: String? = null,
)

