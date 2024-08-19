/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class SerializedChatMessage(
  val contextFiles: List<ContextItem>? = null,
  val error: ChatError? = null,
  val editorState: Any? = null,
  val speaker: SpeakerEnum, // Oneof: human, assistant, system
  val text: String? = null,
  val model: String? = null,
) {

  enum class SpeakerEnum {
    @SerializedName("human") Human,
    @SerializedName("assistant") Assistant,
    @SerializedName("system") System,
  }
}

