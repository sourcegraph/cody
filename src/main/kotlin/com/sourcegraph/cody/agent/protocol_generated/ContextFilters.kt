@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ContextFilters(
  val include: List<CodyContextFilterItem>? = null,
  val exclude: List<CodyContextFilterItem>? = null,
)

