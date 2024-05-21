@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class Chat_RestoreParams(
  val modelID: String? = null,
  val messages: List<SerializedChatMessage>,
  val chatID: String,
)

