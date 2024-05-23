package com.sourcegraph.cody.agent.protocol

data class ProtocolTextDocumentContentChangeEvent(
    val range: Range,
    val text: String,
)
