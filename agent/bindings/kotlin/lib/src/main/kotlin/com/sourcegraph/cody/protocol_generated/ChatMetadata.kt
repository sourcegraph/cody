@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ChatMetadata(
  val source: ChatEventSource? = null, // Oneof: chat, editor, menu, sidebar, code-action:explain, code-action:document, code-action:edit, code-action:fix, code-action:generate, custom-commands, test, code-lens, explain, unit, smell, terminal, doc
  val requestID: String? = null,
  val chatModel: String? = null,
)

