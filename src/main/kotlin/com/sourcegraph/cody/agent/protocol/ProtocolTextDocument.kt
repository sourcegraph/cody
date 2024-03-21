package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.agent.protocol.util.Rfc3986UriEncoder

class ProtocolTextDocument
private constructor(
    var uri: String,
    var content: String?,
    var selection: Range?,
) {

  companion object {

    @JvmStatic
    @JvmOverloads
    fun fromVirtualFile(
        file: VirtualFile,
        content: String? = null,
        selection: Range? = null
    ): ProtocolTextDocument {
      val rfc3986Uri = Rfc3986UriEncoder.encode(file.url)
      return ProtocolTextDocument(rfc3986Uri, content, selection)
    }
  }
}
