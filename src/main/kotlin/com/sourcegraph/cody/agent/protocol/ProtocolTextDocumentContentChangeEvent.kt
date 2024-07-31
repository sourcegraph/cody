package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol_generated.Range

data class ProtocolTextDocumentContentChangeEvent(
    val range: Range,
    val text: String,
)
