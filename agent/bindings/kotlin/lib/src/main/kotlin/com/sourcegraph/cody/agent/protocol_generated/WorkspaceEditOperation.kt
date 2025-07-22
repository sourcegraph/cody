@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class WorkspaceEditOperation {
  companion object {
    val deserializer: JsonDeserializer<WorkspaceEditOperation> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "create-file" -> context.deserialize<CreateFileOperation>(element, CreateFileOperation::class.java)
          "edit-file" -> context.deserialize<EditFileOperation>(element, EditFileOperation::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class CreateFileOperation(
  val type: TypeEnum, // Oneof: create-file
  val uri: String,
  val options: WriteFileOptions? = null,
  val textContents: String,
  val metadata: WorkspaceEditEntryMetadata? = null,
) : WorkspaceEditOperation() {

  enum class TypeEnum {
    @SerializedName("create-file") `Create-file`,
  }
}

data class EditFileOperation(
  val type: TypeEnum, // Oneof: edit-file
  val uri: String,
  val edits: List<TextEdit>,
) : WorkspaceEditOperation() {

  enum class TypeEnum {
    @SerializedName("edit-file") `Edit-file`,
  }
}

