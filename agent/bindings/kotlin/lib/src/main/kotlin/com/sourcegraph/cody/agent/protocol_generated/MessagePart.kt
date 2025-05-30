@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class MessagePart {
  companion object {
    val deserializer: JsonDeserializer<MessagePart> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "text" -> context.deserialize<TextContentPart>(element, TextContentPart::class.java)
          "context_file" -> context.deserialize<ContextFileMessagePart>(element, ContextFileMessagePart::class.java)
          "context_repo" -> context.deserialize<ContextRepoMessagePart>(element, ContextRepoMessagePart::class.java)
          "image_url" -> context.deserialize<ImageContentPart>(element, ImageContentPart::class.java)
          "tool_call" -> context.deserialize<ToolCallContentPart>(element, ToolCallContentPart::class.java)
          "tool_result" -> context.deserialize<ToolResultContentPart>(element, ToolResultContentPart::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class TextContentPart(
  val type: TypeEnum, // Oneof: text
  val text: String? = null,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("text") Text,
  }
}

data class ContextFileMessagePart(
  val type: TypeEnum, // Oneof: context_file
  val uri: String,
  val content: String? = null,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("context_file") ContextFile,
  }
}

data class ContextRepoMessagePart(
  val type: TypeEnum, // Oneof: context_repo
  val repoId: String,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("context_repo") ContextRepo,
  }
}

data class ImageContentPart(
  val type: TypeEnum, // Oneof: image_url
  val image_url: Image_urlParams,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("image_url") ImageUrl,
  }
}

data class ToolCallContentPart(
  val type: TypeEnum, // Oneof: tool_call
  val tool_call: Tool_callParams,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("tool_call") ToolCall,
  }
}

data class ToolResultContentPart(
  val type: TypeEnum, // Oneof: tool_result
  val tool_result: Tool_resultParams,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("tool_result") ToolResult,
  }
}

