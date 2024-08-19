/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ShowWindowMessageParams(
  val severity: SeverityEnum, // Oneof: error, warning, information
  val message: String,
  val options: MessageOptions? = null,
  val items: List<String>? = null,
) {

  enum class SeverityEnum {
    @SerializedName("error") Error,
    @SerializedName("warning") Warning,
    @SerializedName("information") Information,
  }
}

