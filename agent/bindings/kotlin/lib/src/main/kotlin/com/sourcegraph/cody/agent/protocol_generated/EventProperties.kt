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

