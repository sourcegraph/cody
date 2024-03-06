package com.sourcegraph.cody.agent.protocol.util

object Rfc3986UriEncoder {

  // todo solve this with library
  fun encode(uri: String): String {
    val found = "(\\w+:///?)([A-Za-z])(:.+)".toRegex().find(uri)
    if (found != null && found.groups.size == 4) {
      val (protocol, partition, rest) = found.destructured
      return "$protocol${partition.lowercase()}$rest"
    } else {
      return uri
    }
  }
}
