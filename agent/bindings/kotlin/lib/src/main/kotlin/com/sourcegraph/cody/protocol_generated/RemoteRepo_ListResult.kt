@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class RemoteRepo_ListResult(
  val startIndex: Int? = null,
  val count: Int? = null,
  val repos: List<ReposParams>? = null,
  val state: RemoteRepoFetchState? = null,
)

