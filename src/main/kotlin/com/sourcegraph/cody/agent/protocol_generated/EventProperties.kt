/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class EventProperties(
  val anonymousUserID: String,
  val prefix: String,
  val client: String,
  val source: SourceEnum, // Oneof: IDEEXTENSION
) {

  enum class SourceEnum {
    @SerializedName("IDEEXTENSION") IDEEXTENSION,
  }
}

