@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class TextEdit {
  companion object {
    val deserializer: JsonDeserializer<TextEdit> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("type").asString) {
          "replace" -> context.deserialize<ReplaceTextEdit>(element, ReplaceTextEdit::class.java)
          "insert" -> context.deserialize<InsertTextEdit>(element, InsertTextEdit::class.java)
          "delete" -> context.deserialize<DeleteTextEdit>(element, DeleteTextEdit::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ReplaceTextEdit(
  val type: TypeEnum? = null, // Oneof: replace
  val range: Range? = null,
  val value: String? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : TextEdit() {

  enum class TypeEnum {
    @SerializedName("replace") Replace,
  }
}

data class InsertTextEdit(
  val type: TypeEnum? = null, // Oneof: insert
  val position: Position? = null,
  val value: String? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : TextEdit() {

  enum class TypeEnum {
    @SerializedName("insert") Insert,
  }
}

data class DeleteTextEdit(
  val type: TypeEnum? = null, // Oneof: delete
  val range: Range? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : TextEdit() {

  enum class TypeEnum {
    @SerializedName("delete") Delete,
  }
}

