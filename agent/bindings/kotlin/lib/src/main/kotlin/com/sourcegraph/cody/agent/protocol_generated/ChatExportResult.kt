@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ChatExportResult(
  val chatID: String,
  val transcript: SerializedChatTranscript,
)

