package com.sourcegraph.cody.agent.protocol

data class TextDocumentShowOptions(
    val preserveFocus: Boolean?,
    val preview: Boolean?,
    val selection: Range?,
)
