@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CodyCommandContext(
  val none: Boolean? = null,
  val openTabs: Boolean? = null,
  val currentDir: Boolean? = null,
  val currentFile: Boolean? = null,
  val selection: Boolean? = null,
  val command: String? = null,
  val filePath: String? = null,
  val directoryPath: String? = null,
  val codebase: Boolean? = null,
)

