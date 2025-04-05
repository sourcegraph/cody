@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class RemovedLineInfo(
  val id: String,
  val type: TypeEnum, // Oneof: removed
  val text: String,
  val originalLineNumber: Long,
) {

  enum class TypeEnum {
    @SerializedName("removed") Removed,
  }
}

