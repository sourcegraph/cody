@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class CustomCommandResult {
  companion object {
    val deserializer: JsonDeserializer<CustomCommandResult> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("type").asString) {
          "chat" -> context.deserialize<CustomChatCommandResult>(element, CustomChatCommandResult::class.java)
          "edit" -> context.deserialize<CustomEditCommandResult>(element, CustomEditCommandResult::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class CustomChatCommandResult(
  val type: TypeEnum? = null, // Oneof: chat
  val chatResult: String? = null,
) : CustomCommandResult() {

  enum class TypeEnum {
    @SerializedName("chat") Chat,
  }
}

data class CustomEditCommandResult(
  val type: TypeEnum? = null, // Oneof: edit
  val editResult: EditTask? = null,
) : CustomCommandResult() {

  enum class TypeEnum {
    @SerializedName("edit") Edit,
  }
}

