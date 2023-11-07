package com.sourcegraph.cody.agent.protocol

data class TextDocument
// JvmOverloads needed until CodyAgentFocusListener
// and CodyFileEditorListener are converted to Kotlin.
@JvmOverloads
constructor(
    var filePath: String,
    var content: String? = null,
    var selection: Range? = null,
)
