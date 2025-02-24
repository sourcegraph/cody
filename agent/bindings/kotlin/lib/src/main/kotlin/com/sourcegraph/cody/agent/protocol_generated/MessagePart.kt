@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

sealed class MessagePart {
  data class Text(val text: String) : MessagePart()
  data class ImageUrl(val image_url: ImageUrlData) : MessagePart()
}

data class ImageUrlData(val url: String)