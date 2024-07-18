@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class RemoteRepo_ListParams(
  val query: String? = null,
  val first: Long,
  val afterId: String? = null,
)

