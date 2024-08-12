@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class SerializedChatInteraction(
  val humanMessage: SerializedChatMessage,
  val assistantMessage: SerializedChatMessage? = null,
)

