/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
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

