package com.sourcegraph.cody.agent.protocol

data class TextDocumentEditOptions(val undoStopBefore: Boolean, val undoStopAfter: Boolean)
