/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
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

