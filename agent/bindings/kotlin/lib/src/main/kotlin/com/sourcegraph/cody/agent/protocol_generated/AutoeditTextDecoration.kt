@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class AutoeditTextDecoration(
  val type: TypeEnum, // Oneof: insert, delete
  val range: Range,
  val text: String? = null,
) {

  enum class TypeEnum {
    @SerializedName("insert") Insert,
    @SerializedName("delete") Delete,
  }
}

