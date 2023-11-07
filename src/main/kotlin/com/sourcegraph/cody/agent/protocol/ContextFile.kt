package com.sourcegraph.cody.agent.protocol

data class ContextFile(
    val fileName: String,
    val repoName: String?,
    val revision: String?,
)
