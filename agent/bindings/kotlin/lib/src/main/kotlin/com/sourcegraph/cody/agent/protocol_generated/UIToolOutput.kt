@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class UIToolOutput(
  val title: String? = null,
  val query: String? = null,
  val search: UISearchResults? = null,
  val diff: UIFileDiff? = null,
  val terminal: List<UITerminalLine>? = null,
  val file: UIFileView? = null,
)

