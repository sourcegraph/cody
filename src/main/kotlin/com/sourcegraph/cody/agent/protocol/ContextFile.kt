package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonSerializer
import java.lang.reflect.Type
import java.net.URI
import kotlinx.serialization.json.jsonObject

sealed class ContextFile() {
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
      val uri = context.deserialize<URI>(jsonObject["uri"], URI::class.java)
      val repoName = jsonObject["repoName"]?.asString
      val revision = jsonObject["revision"]?.asString

      when (jsonObject["type"]?.asString) {
        "file" -> ContextFileFile(uri, repoName, revision)

        // TODO(beyang): should throw an exception here, but we don't because the context field is
        // overloaded in the protocol
        else -> null
      }
    }

val uriDeserializer =
    JsonDeserializer { jsonElement: JsonElement, typ: Type, context: JsonDeserializationContext ->
      val j = jsonElement.asJsonObject
      URI(
          j["scheme"]?.asString,
          j["authority"]?.asString,
          j["path"]?.asString,
          j["query"]?.asString,
          j["fragment"]?.asString,
      )
    }

val uriSerializer = JsonSerializer { uri: URI, type, context ->
  val obj = JsonObject()
  obj.addProperty("scheme", uri.scheme)
  obj.addProperty("authority", uri.authority)
  obj.addProperty("path", uri.path)
  obj.addProperty("query", uri.query)
  obj.addProperty("fragment", uri.fragment)
  obj
}

fun contextFilesFromList(list: List<Any>): List<String> {
  val contextFiles = ArrayList<String>()
  for (item in list) {
    if (item is Map<*, *> && item.get("type") == "file") {
      val path = (item.get("uri") as Map<*, *>).get("path")
      contextFiles.add(path as String)
    }
  }
  return contextFiles
}
