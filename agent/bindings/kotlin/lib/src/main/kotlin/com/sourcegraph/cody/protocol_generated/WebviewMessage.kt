@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class WebviewMessage() {
  companion object {
    val deserializer: JsonDeserializer<WebviewMessage> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("${union.discriminatorDisplayName}").asString) {
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

