@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class Cache_controlParams(
  val type: TypeEnum? = null, // Oneof: ephemeral
) {

  enum class TypeEnum {
    @SerializedName("ephemeral") Ephemeral,
  }
}

