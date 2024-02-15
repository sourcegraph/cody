@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class WorkspaceEditOperation(
  val type: TypeEnum? = null, // Oneof: rename-file, delete-file, edit-file, create-file
  val uri: String? = null,
  val options: WriteFileOptions? = null,
  val textContents: String? = null,
  val metadata: WorkspaceEditEntryMetadata? = null,
  val oldUri: String? = null,
  val newUri: String? = null,
  val deleteOptions: DeleteOptionsParams? = null,
  val edits: List<TextEdit>? = null,
)

