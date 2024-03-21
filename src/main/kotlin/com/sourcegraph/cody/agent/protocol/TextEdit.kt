package com.sourcegraph.cody.agent.protocol

data class TextEdit(
    // This tag will be 'replace', 'insert', or 'delete'.
    val type: String,

    // Valid for replace & delete.
    val range: Range? = null,

    // Valid for insert.
    val position: Position? = null,

    // Valid for replace & insert.
    val value: String? = null
)
