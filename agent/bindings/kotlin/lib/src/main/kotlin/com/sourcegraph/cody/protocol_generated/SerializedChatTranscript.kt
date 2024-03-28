@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class SerializedChatTranscript(
  val id: String? = null,
  val chatModel: String? = null,
  val chatTitle: String? = null,
  val interactions: List<SerializedChatInteraction>? = null,
  val lastInteractionTimestamp: String? = null,
  val enhancedContext: EnhancedContextParams? = null,
)

