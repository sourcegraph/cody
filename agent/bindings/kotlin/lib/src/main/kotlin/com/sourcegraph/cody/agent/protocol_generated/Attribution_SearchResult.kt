@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Attribution_SearchResult(
  val error: String? = null,
  val repoNames: List<String>,
  val limitHit: Boolean,
)

