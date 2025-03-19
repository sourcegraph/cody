@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class UITerminalLine(
  val content: String,
  val type: UITerminalOutputType? = null, // Oneof: input, output, error, warning, success
)

