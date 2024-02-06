package com.sourcegraph.cody.agent.protocol

data class AttributionSearchResponse(
    val error: String?,
    val repoNames: List<String>,
    val limitHit: Boolean,
)
