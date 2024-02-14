@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class WorkspaceEditParams(
  var operations: List<WorkspaceEditOperation>? = null,
  var metadata: WorkspaceEditMetadata? = null,
)

