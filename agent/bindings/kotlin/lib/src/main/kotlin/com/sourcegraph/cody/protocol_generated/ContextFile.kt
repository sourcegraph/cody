@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class ContextFile {
  companion object {
    val deserializer: JsonDeserializer<ContextFile> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("type").asString) {
          "file" -> context.deserialize<ContextFileFile>(element, ContextFileFile::class.java)
          "symbol" -> context.deserialize<ContextFileSymbol>(element, ContextFileSymbol::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ContextFileFile(
  val uri: Uri? = null,
  val range: ActiveTextEditorSelectionRange? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextFileSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal
  val content: String? = null,
  val type: TypeEnum? = null, // Oneof: file
) : ContextFile() {

  enum class TypeEnum {
    @SerializedName("file") File,
  }
}

data class ContextFileSymbol(
  val uri: Uri? = null,
  val range: ActiveTextEditorSelectionRange? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextFileSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal
  val content: String? = null,
  val type: TypeEnum? = null, // Oneof: symbol
  val symbolName: String? = null,
  val kind: SymbolKind? = null, // Oneof: class, function, method
) : ContextFile() {

  enum class TypeEnum {
    @SerializedName("symbol") Symbol,
  }
}

