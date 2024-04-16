package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.error.CodyError

data class RemoteRepoHasParams(
    val repoName: String,
)

data class RemoteRepoHasResponse(
    val result: Boolean,
)

data class RemoteRepoListParams(
    val query: String?,
    val first: Int,
    val after: String?,
)

data class RemoteRepoListResponse(
    val startIndex: Int,
    val count: Int,
    val repos: List<Repo>,
    val state: RemoteRepoFetchState,
)

data class RemoteRepoFetchState(
    val state: String, // one of: "paused", "fetching", "errored", "complete"
    val error: CodyError?,
)
