@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class NetworkRequest(
  val url: String,
  val body: String? = null,
  val error: String? = null,
)

