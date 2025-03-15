@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class UnchangedLineInfo(
  val id: String,
  val type: TypeEnum, // Oneof: unchanged
  val text: String,
  val originalLineNumber: Long,
  val modifiedLineNumber: Long,
) {

  enum class TypeEnum {
    @SerializedName("unchanged") Unchanged,
  }
}

