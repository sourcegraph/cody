package com.sourcegraph.cody.agent.protocol

data class UntitledTextDocument(
    val uri: String,
    val content: String?,
    val language: String?,
)
