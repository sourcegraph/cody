@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Chat_ImportParams(
  val history: Map<String, Map<String, SerializedChatTranscript>>,
  val merge: Boolean,
)

