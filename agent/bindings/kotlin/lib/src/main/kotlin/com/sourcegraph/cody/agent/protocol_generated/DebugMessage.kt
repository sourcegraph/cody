@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class DebugMessage(
  val channel: String,
  val message: String,
  val level: DebugMessageLogLevel? = null, // Oneof: trace, debug, info, warn, error
)

