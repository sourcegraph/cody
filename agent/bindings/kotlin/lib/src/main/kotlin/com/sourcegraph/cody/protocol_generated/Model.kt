@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated;

data class Model(
  val model: String,
  val usage: List<ModelUsage>,
  val contextWindow: ModelContextWindow,
  val clientSideConfig: ClientSideConfigParams? = null,
  val provider: String,
  val title: String,
  val tags: List<ModelTag>,
)

