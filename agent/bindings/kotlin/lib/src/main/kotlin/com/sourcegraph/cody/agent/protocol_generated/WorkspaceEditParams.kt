@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class WorkspaceEditParams(
  val operations: List<WorkspaceEditOperation>,
  val metadata: WorkspaceEditMetadata? = null,
)

