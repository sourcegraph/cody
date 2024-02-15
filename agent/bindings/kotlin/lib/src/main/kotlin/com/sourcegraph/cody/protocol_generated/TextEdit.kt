@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class TextEdit(
  val type: TypeEnum? = null, // Oneof: insert, delete, replace
  val range: Range? = null,
  val value: String? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
  val position: Position? = null,
)

