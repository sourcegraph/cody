@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class UIFileView(
  val fileName: String,
  val uri: Uri,
  val content: String? = null,
)

