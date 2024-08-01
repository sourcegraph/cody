@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class RequestMessage(
  val streamId: String? = null,
  val method: String,
  val args: List<Any>,
  val streamIdToAbort: String,
)

