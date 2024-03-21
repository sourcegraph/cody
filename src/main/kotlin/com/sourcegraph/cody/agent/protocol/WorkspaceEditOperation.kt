package com.sourcegraph.cody.agent.protocol

data class WorkspaceEditParamsOptions(
    val overwrite: Boolean = false,
    val ignoreIfNotExists: Boolean = false,
    val recursive: Boolean = false
)

data class WorkspaceEditOperation(
    val type: String, // all
    val uri: String? = null, // created, delete, edit
    val oldUri: String? = null, // rename
    val newUri: String? = null, // rename
    val textContents: String? = null, // create-file
    val options: WorkspaceEditParamsOptions? = null, // all
    val metadata: WorkspaceEditMetadata? = null, // all
    val edits: List<TextEdit>? = null
) // edit
