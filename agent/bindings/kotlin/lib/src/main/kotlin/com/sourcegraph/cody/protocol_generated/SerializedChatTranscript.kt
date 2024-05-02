@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class SerializedChatTranscript(
  val id: String,
  val chatModel: String? = null,
  val chatTitle: String? = null,
  val interactions: List<SerializedChatInteraction>,
  val lastInteractionTimestamp: String,
  val enhancedContext: EnhancedContextParams? = null,
)

