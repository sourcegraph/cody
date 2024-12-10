package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol_generated.Range

data class TextDocumentShowOptions(
    val preserveFocus: Boolean?,
    val preview: Boolean?,
    val selection: Range?,
)
