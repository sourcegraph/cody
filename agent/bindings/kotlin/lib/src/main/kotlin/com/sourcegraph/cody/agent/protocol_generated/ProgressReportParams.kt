@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ProgressReportParams(
  val id: String,
  val message: String? = null,
  val increment: Long? = null,
)

