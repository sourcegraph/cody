@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class CustomCommandResult {
  companion object {
    val deserializer: JsonDeserializer<CustomCommandResult> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "chat" -> context.deserialize<CustomChatCommandResult>(element, CustomChatCommandResult::class.java)
          "edit" -> context.deserialize<CustomEditCommandResult>(element, CustomEditCommandResult::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class CustomChatCommandResult(
  val type: TypeEnum, // Oneof: chat
  val chatResult: String,
) : CustomCommandResult() {

  enum class TypeEnum {
    @SerializedName("chat") Chat,
  }
}

data class CustomEditCommandResult(
  val type: TypeEnum, // Oneof: edit
  val editResult: EditTask,
) : CustomCommandResult() {

  enum class TypeEnum {
    @SerializedName("edit") Edit,
  }
}

