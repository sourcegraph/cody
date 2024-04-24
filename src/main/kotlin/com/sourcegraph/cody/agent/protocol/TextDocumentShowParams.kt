package com.sourcegraph.cody.agent.protocol

data class TextDocumentShowParams(val uri: String, val options: TextDocumentShowOptions?)
