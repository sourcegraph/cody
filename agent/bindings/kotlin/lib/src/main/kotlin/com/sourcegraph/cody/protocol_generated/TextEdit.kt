@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class TextEdit(
  var type: String? = null, // Oneof: insert, delete, replace
  var range: Range? = null,
  var value: String? = null,
  var metadata: WorkspaceEditEntryMetadata? = null,
  var position: Position? = null,
)

