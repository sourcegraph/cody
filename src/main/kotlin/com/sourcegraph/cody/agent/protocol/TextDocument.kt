package com.sourcegraph.cody.agent.protocol

import java.net.URI
import java.nio.file.Paths

data class TextDocument
// JvmOverloads needed until CodyAgentFocusListener
// and CodyFileEditorListener are converted to Kotlin.
@JvmOverloads
constructor(
    var uri: URI,
    var content: String? = null,
    var selection: Range? = null,
) {
  @JvmOverloads
  constructor(
      filePath: String,
      content: String? = null,
      selection: Range? = null,
  ) : this(Paths.get(filePath).toUri(), content, selection)
}
