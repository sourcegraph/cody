package com.sourcegraph.cody.agent.protocol

data class TelemetryEvent(
    val feature: String,
    val action: String,
    val parameters: TelemetryEventParameters?
)
