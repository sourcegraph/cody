package com.sourcegraph.cody.agent.protocol

data class TextDocumentEditParams(
    val uri: String,
    val edits: List<TextEdit>,
    val options: TextDocumentEditOptions? = null
)
