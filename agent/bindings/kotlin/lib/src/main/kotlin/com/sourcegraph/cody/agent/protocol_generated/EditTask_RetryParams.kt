@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class EditTask_RetryParams(
  val id: FixupTaskID,
  val instruction: String,
  val model: String,
  val mode: ModeEnum, // Oneof: edit, insert
  val range: Range,
) {

  enum class ModeEnum {
    @SerializedName("edit") Edit,
    @SerializedName("insert") Insert,
  }
}

