@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class SerializedChatTranscript(
  val id: String,
  val chatTitle: String? = null,
  val interactions: List<SerializedChatInteraction>,
  val lastInteractionTimestamp: String,
  val enhancedContext: EnhancedContextParams? = null,
)

