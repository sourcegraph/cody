package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonSerializer
import java.lang.reflect.Type
import java.net.URI

val uriDeserializer =
    JsonDeserializer { jsonElement: JsonElement?, _: Type, _: JsonDeserializationContext ->
      fun asStringOrNull(elem: JsonElement?): String? {
        return if (elem == null || elem.isJsonNull) null else elem.asString
      }

      val j = jsonElement?.asJsonObject
      if (j == null || j.isJsonNull) {
        null
      } else if (j.isJsonPrimitive) {
        j.asString
      } else {
        URI(
            asStringOrNull(j["scheme"]),
            asStringOrNull(j["authority"]),
            asStringOrNull(j["path"]),
            asStringOrNull(j["query"]),
            asStringOrNull(j["fragment"]))
      }
    }

val uriSerializer = JsonSerializer { uri: URI?, _, _ ->
  if (uri == null) {
    JsonNull.INSTANCE
  } else {
    val obj = JsonObject()
    obj.addProperty("scheme", uri.scheme)
    obj.addProperty("authority", uri.authority)
    obj.addProperty("path", uri.path)
    obj.addProperty("query", uri.query)
    obj.addProperty("fragment", uri.fragment)
    obj
  }
}
