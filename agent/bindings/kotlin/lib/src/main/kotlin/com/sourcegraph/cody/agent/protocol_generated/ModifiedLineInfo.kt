@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ModifiedLineInfo(
  val id: String,
  val type: TypeEnum, // Oneof: modified
  val oldText: String,
  val newText: String,
  val changes: List<LineChange>,
  val originalLineNumber: Long,
  val modifiedLineNumber: Long,
) {

  enum class TypeEnum {
    @SerializedName("modified") Modified,
  }
}

