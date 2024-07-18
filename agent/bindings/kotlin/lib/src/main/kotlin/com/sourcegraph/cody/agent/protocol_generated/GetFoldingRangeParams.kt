@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class GetFoldingRangeParams(
  val uri: String,
  val range: Range,
)

