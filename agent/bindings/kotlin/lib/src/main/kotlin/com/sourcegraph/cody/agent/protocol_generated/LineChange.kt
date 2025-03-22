@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class LineChange(
  val id: String,
  val type: TypeEnum, // Oneof: insert, delete, unchanged
  val originalRange: Range,
  val modifiedRange: Range,
  val text: String,
) {

  enum class TypeEnum {
    @SerializedName("insert") Insert,
    @SerializedName("delete") Delete,
    @SerializedName("unchanged") Unchanged,
  }
}

