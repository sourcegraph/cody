@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class UIDiffLine(
  val type: TypeEnum, // Oneof: added, removed, unchanged
  val content: String,
  val lineNumber: Long,
) {

  enum class TypeEnum {
    @SerializedName("added") Added,
    @SerializedName("removed") Removed,
    @SerializedName("unchanged") Unchanged,
  }
}

