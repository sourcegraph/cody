package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonDeserializer
import com.google.gson.annotations.SerializedName

enum class Source(val source: String) {
  @SerializedName("chat") CHAT("chat"),
  @SerializedName("explain") EXPLAIN("explain"),
  @SerializedName("smell") SMELL("smell"),
  @SerializedName("test") TEST("test")
}

val sourceDeserializer = JsonDeserializer { src, _, _ ->
  Source.values().find { it.source == src.asString }
}
