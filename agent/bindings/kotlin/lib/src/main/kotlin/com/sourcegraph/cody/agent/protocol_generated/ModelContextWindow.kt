@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ModelContextWindow(
  val input: Long,
  val output: Long,
  val context: ContextParams? = null,
)

