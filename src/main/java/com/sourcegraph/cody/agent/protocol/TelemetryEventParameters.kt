package com.sourcegraph.cody.agent.protocol

data class TelemetryEventParameters(
    val version: Long? = null,
    val interactionID: String? = null,
    val metadata: Map<String, Long>? = null,
    val privateMetadata: Map<String, String>? = null,
)
