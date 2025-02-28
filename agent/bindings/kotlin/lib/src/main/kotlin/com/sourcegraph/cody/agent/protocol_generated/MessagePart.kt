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
          "text" -> context.deserialize<TextMessagePart>(element, TextMessagePart::class.java)
          "image_url" -> context.deserialize<Image-urlMessagePart>(element, Image-urlMessagePart::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class TextMessagePart(
  val type: TypeEnum, // Oneof: text
  val text: String,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("text") Text,
  }
}

data class Image-urlMessagePart(
  val type: TypeEnum, // Oneof: image_url
  val imageUrl: Image_urlParams,
  val mimeType: String? = null,
) : MessagePart() {

  enum class TypeEnum {
    @SerializedName("image_url") Image-url,
  }
}

