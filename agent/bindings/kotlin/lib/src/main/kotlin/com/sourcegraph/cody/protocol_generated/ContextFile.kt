@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ContextFile(
  var uri: Uri? = null,
  var range: ActiveTextEditorSelectionRange? = null,
  var repoName: String? = null,
  var revision: String? = null,
  var title: String? = null,
  var source: ContextFileSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal
  var content: String? = null,
  var type: String? = null, // Oneof: symbol, file
  var symbolName: String? = null,
  var kind: SymbolKind? = null, // Oneof: class, function, method
)

