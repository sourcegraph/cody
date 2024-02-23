@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class WorkspaceEditOperation {
  companion object {
    val deserializer: JsonDeserializer<WorkspaceEditOperation> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("type").asString) {
          "create-file" -> context.deserialize<CreateFileOperation>(element, CreateFileOperation::class.java)
          "rename-file" -> context.deserialize<RenameFileOperation>(element, RenameFileOperation::class.java)
          "delete-file" -> context.deserialize<DeleteFileOperation>(element, DeleteFileOperation::class.java)
          "edit-file" -> context.deserialize<EditFileOperation>(element, EditFileOperation::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class CreateFileOperation(
  val type: TypeEnum? = null, // Oneof: create-file
  val uri: String? = null,
  val options: WriteFileOptions? = null,
  val textContents: String? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : WorkspaceEditOperation() {

  enum class TypeEnum {
    @SerializedName("create-file") `Create-file`,
  }
}

data class RenameFileOperation(
  val type: TypeEnum? = null, // Oneof: rename-file
  val oldUri: String? = null,
  val newUri: String? = null,
  val options: WriteFileOptions? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : WorkspaceEditOperation() {

  enum class TypeEnum {
    @SerializedName("rename-file") `Rename-file`,
  }
}

data class DeleteFileOperation(
  val type: TypeEnum? = null, // Oneof: delete-file
  val uri: String? = null,
  val deleteOptions: DeleteOptionsParams? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : WorkspaceEditOperation() {

  enum class TypeEnum {
    @SerializedName("delete-file") `Delete-file`,
  }
}

data class EditFileOperation(
  val type: TypeEnum? = null, // Oneof: edit-file
  val uri: String? = null,
  val edits: List<TextEdit>? = null,
) : WorkspaceEditOperation() {

  enum class TypeEnum {
    @SerializedName("edit-file") `Edit-file`,
  }
}

