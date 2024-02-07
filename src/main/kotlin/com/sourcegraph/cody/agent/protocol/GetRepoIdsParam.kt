package com.sourcegraph.cody.agent.protocol

data class GetRepoIdsParam(val names: List<String>, val first: Int)
