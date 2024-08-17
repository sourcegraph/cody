@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class WorkspaceEditEntryMetadata(
  val needsConfirmation: Boolean,
  val label: String,
  val description: String? = null,
  val iconPath: Uri,
)

