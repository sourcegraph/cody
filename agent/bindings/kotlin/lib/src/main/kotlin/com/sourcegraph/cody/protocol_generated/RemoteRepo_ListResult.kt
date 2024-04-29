@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class RemoteRepo_ListResult(
  val startIndex: Int,
  val count: Int,
  val repos: List<ReposParams>,
  val state: RemoteRepoFetchState,
)

