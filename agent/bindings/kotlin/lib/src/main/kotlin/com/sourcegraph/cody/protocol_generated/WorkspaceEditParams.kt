@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class WorkspaceEditParams(
  val operations: List<WorkspaceEditOperation>? = null,
  val metadata: WorkspaceEditMetadata? = null,
)

