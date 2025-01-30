@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ContentPart(
  val type: TypeEnum, // Oneof: text
  val text: String,
  val cache_control: Cache_controlParams? = null,
) {

  enum class TypeEnum {
    @SerializedName("text") Text,
  }
}

