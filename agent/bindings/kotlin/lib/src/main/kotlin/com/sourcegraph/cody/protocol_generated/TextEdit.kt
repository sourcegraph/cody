@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class TextEdit(
  val type: TypeEnum? = null, // Oneof: insert, delete, replace
  val range: Range? = null,
  val value: String? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
  val position: Position? = null,
) {

  enum class TypeEnum {
    @SerializedName("insert") Insert,
    @SerializedName("delete") Delete,
    @SerializedName("replace") Replace,
  }
}

