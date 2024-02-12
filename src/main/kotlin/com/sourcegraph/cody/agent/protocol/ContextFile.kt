package com.sourcegraph.cody.agent.protocol

import com.google.gson.*
import java.lang.reflect.Type
import java.net.URI

sealed class ContextFile {
  abstract val type: String
  abstract val uri: URI
  abstract val repoName: String?
  abstract val revision: String?
}

data class ContextFileFile(
    override val uri: URI,
    override val repoName: String?,
    override val revision: String?,
) : ContextFile() {
  override val type: String = "file"
}

val contextFileDeserializer =
    JsonDeserializer { jsonElement: JsonElement, typ: Type, context: JsonDeserializationContext ->
      val jsonObject = jsonElement.asJsonObject
      when (jsonObject["type"]?.asString) {
        "file" -> {
          val uri = context.deserialize<URI>(jsonObject["uri"], URI::class.java)
          val repoName = jsonObject["repoName"]?.asString
          val revision = jsonObject["revision"]?.asString

          ContextFileFile(uri, repoName, revision)
        }

        // TODO(beyang): should throw an exception here, but we don't because the context field is
        // overloaded in the protocol
        else -> null
      }
    }

val uriDeserializer =
    JsonDeserializer { jsonElement: JsonElement, typ: Type, context: JsonDeserializationContext ->
      val j = jsonElement?.asJsonObject
      if (j == null || j.isJsonNull) {
        null
      } else if (j.isJsonPrimitive) {
        j.asString
      } else {
        URI(
            j["scheme"]?.asString,
            j["authority"]?.asString,
            j["path"]?.asString,
            j["query"]?.asString,
            j["fragment"]?.asString,
        )
      }
    }

val uriSerializer = JsonSerializer { uri: URI, type, context ->
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
