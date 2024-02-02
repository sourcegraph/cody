@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class WorkspaceEditOperation(
  var type: String? = null, // Oneof: create-file
  var uri: String? = null,
  var options: WriteFileOptions? = null,
  var textContents: String? = null,
  var metadata: WorkspaceEditEntryMetadata? = null,
  var oldUri: String? = null,
  var newUri: String? = null,
  var deleteOptions: DeleteOptionsParams? = null,
  var edits: List<TextEdit>? = null,
)

