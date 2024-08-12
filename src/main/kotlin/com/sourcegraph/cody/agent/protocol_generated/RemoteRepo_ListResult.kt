@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class RemoteRepo_ListResult(
  val startIndex: Long,
  val count: Long,
  val repos: List<ReposParams>,
  val state: RemoteRepoFetchState,
)

