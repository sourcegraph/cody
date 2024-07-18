@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CodyContextFilterItem(
  val repoNamePattern: String,
  val filePathPatterns: List<String>? = null,
)

