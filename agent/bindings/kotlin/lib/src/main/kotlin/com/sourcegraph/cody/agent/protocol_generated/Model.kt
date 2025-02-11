@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Model(
  val id: String,
  val usage: List<ModelUsage>,
  val contextWindow: ModelContextWindow,
  val clientSideConfig: ClientSideConfig? = null,
  val provider: String? = null,
  val title: String,
  val tags: List<ModelTag>? = null,
  val modelRef: ModelRef? = null,
)

