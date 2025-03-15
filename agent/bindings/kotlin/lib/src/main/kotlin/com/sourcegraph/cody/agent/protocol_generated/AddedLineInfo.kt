@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class AddedLineInfo(
  val id: String,
  val type: TypeEnum, // Oneof: added
  val text: String,
  val modifiedLineNumber: Long,
) {

  enum class TypeEnum {
    @SerializedName("added") Added,
  }
}

