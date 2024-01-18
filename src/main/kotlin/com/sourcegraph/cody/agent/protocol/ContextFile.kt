package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type
import java.net.URI

data class ContextFile(
    val uri: URI,
    val repoName: String?,
    val revision: String?,
)

val contextFileDeserializer =
    JsonDeserializer { jsonElement: JsonElement, _: Type, _: JsonDeserializationContext ->
      val jsonObject = jsonElement.asJsonObject

      val uriObj = jsonObject["uri"].asJsonObject
      val uri =
          URI(
              uriObj["scheme"]?.asString,
              uriObj["host"]?.asString,
              uriObj["path"]?.asString,
              /* fragment= */ null)
      val repoName = jsonObject["repoName"]?.asString
      val revision = jsonObject["revision"]?.asString

      ContextFile(uri, repoName, revision)
    }
