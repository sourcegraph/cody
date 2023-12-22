package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol.util.Rfc3986UriEncoder
import java.nio.file.Paths

class TextDocument
private constructor(
    var uri: String,
    var content: String?,
    var selection: Range?,
) {

  companion object {

    @JvmStatic
    @JvmOverloads
    fun fromPath(path: String, content: String? = null, selection: Range? = null): TextDocument {
      val uri = Paths.get(path).toUri().toString()
      val rfc3986Uri = Rfc3986UriEncoder.encode(uri)
      return TextDocument(rfc3986Uri, content, selection)
    }
  }
}
