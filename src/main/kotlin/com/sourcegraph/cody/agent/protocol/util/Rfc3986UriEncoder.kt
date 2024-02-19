package com.sourcegraph.cody.agent.protocol.util

object Rfc3986UriEncoder {

  // todo solve this with library
  fun encode(uri: String): String {
    val found = "file:///([A-Za-z]):".toRegex().find(uri)
    if (found != null) {
      val partition = found.groups[1]?.value ?: return uri
      return uri.replace("file:///$partition:", "file:///${partition.lowercase()}%3A")
    } else {
      return uri
    }
  }
}
