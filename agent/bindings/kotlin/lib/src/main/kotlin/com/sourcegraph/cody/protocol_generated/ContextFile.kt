@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ContextFile(
  val uri: Uri? = null,
  val range: ActiveTextEditorSelectionRange? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextFileSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal
  val content: String? = null,
  val type: TypeEnum? = null, // Oneof: symbol, file
  val symbolName: String? = null,
  val kind: SymbolKind? = null, // Oneof: class, function, method
) {

  enum class TypeEnum {
    @SerializedName("symbol") Symbol,
    @SerializedName("file") File,
  }
}

