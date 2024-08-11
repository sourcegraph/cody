@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class EditCommands_CodeParams(
  val instruction: String,
  val model: String? = null,
  val mode: ModeEnum? = null, // Oneof: edit, insert
  val range: Range? = null,
) {

  enum class ModeEnum {
    @SerializedName("edit") Edit,
    @SerializedName("insert") Insert,
  }
}

