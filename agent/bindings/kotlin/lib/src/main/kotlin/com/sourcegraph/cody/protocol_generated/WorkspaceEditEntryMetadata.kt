@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class WorkspaceEditEntryMetadata(
  val needsConfirmation: Boolean,
  val label: String,
  val description: String? = null,
  val iconPath: Uri? = null,
)

