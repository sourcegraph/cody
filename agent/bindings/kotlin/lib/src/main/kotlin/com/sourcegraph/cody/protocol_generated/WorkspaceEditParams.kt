@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

data class WorkspaceEditParams(
  val operations: List<WorkspaceEditOperation>? = null,
  val metadata: WorkspaceEditMetadata? = null,
)

