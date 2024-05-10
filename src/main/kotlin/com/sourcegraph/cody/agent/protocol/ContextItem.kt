package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonSerializer
import com.intellij.openapi.vfs.StandardFileSystems
import com.intellij.openapi.vfs.VfsUtil
import java.io.File
import java.lang.reflect.Type
import java.net.URI
import java.nio.file.Path
import kotlin.io.path.toPath

typealias ContextFileSource =
    String // One of: embeddings, user, keyword, editor, filename, search, unified, selection,
// terminal

typealias SymbolKind = String // One of: class, function, method

sealed class ContextItem {
  abstract val type: String // Oneof: file, symbol
  abstract val uri: URI

  companion object {
    val deserializer: JsonDeserializer<ContextItem> =
        JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
          when (element.asJsonObject.get("type").asString) {
            "file" -> context.deserialize<ContextItemFile>(element, ContextItemFile::class.java)
            "symbol" ->
                context.deserialize<ContextItemSymbol>(element, ContextItemSymbol::class.java)
            else -> throw Exception("Unknown discriminator ${element}")
          }
        }
  }

  // TODO(beyang): temporary displayPath implementation. This should be replaced by acquiring the
  // display path from the agent
  // Current behavior: if the path contains more than three components, display the last three.
  fun displayPath(): String {
    val path = uri.path
    val pathComponents = path.split("/") // uri path is posix-style
    if (pathComponents.size > 3) {
      return "...${File.separator}${
        pathComponents.subList(pathComponents.size - 3, pathComponents.size).joinToString(
          File.separator
        )
      }"
    }
    return path.replace("/", File.separator)
  }
}

data class ContextItemFile(
    override val type: String = "file",
    override val uri: URI,
    val range: Range? = null,
    val repoName: String? = null,
    val revision: String? = null,
    val title: String? = null,
    val source: ContextFileSource? =
        null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection,
    // terminal
    val content: String? = null,
    val isTooLarge: Boolean? = null,
    val isIgnored: Boolean? = null,
) : ContextItem() {

  fun isLocal() = repoName == null

  fun getPath(): Path? {
    val newUri = uri.toString().substringBefore("?")
    val fileProtocol = StandardFileSystems.FILE_PROTOCOL_PREFIX
    val uriWithFileProtocol = if (newUri.startsWith(fileProtocol)) newUri else fileProtocol + newUri
    return VfsUtil.toUri(uriWithFileProtocol)?.toPath()
  }

  fun getLinkActionText(projectPath: String?): String {
    val theRange = if (isLocal()) range?.intellijRange() else range?.toSearchRange()
    val path =
        if (isLocal()) {
          "@${uri.path.removePrefix(projectPath ?: "")}"
        } else {
          val repoCommitFile = uri.path.split("@", "/-/blob/")
          if (repoCommitFile.size == 3) {
            val repo = repoCommitFile[0].split("/").lastOrNull()
            "$repo ${repoCommitFile[2]}"
          } else uri.path
        }

    return buildString {
      append(path)
      if (theRange != null) {
        if (theRange.first < theRange.second) {
          append(":${theRange.first}-${theRange.second}")
        } else {
          append(":${theRange.first}")
        }
      }
    }
  }
}

data class ContextItemSymbol(
    override val type: String = "symbol",
    override val uri: URI,
    val range: Range? = null,
    val repoName: String? = null,
    val revision: String? = null,
    val title: String? = null,
    val source: ContextFileSource? =
        null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection,
    // terminal
    val content: String? = null,
    val symbolName: String? = null,
    val kind: SymbolKind? = null, // Oneof: class, function, method
) : ContextItem()

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
