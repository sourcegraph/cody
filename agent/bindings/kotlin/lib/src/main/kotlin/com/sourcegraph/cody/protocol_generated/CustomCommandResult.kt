@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class CustomCommandResult(
  val type: TypeEnum? = null, // Oneof: edit, chat
  val chatResult: String? = null,
  val editResult: EditTask? = null,
) {

  enum class TypeEnum {
    @SerializedName("edit") Edit,
    @SerializedName("chat") Chat,
  }
}

