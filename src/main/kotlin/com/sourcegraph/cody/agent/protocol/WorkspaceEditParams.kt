package com.sourcegraph.cody.agent.protocol

data class WorkspaceEditParams(
    val operations: List<WorkspaceEditOperation>,
    val metadata: WorkspaceEditMetadata? = null
)
