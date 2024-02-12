package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonDeserializer
import com.google.gson.JsonPrimitive
import com.google.gson.JsonSerializer
import com.google.gson.annotations.SerializedName

enum class Speaker(val speaker: String) {
  @SerializedName("human") HUMAN("human"),
  @SerializedName("assistant") ASSISTANT("assistant")
}

val speakerSerializer = JsonSerializer { speaker: Speaker, _, _ -> JsonPrimitive(speaker.speaker) }

val speakerDeserializer = JsonDeserializer { src, _, _ ->
  Speaker.values().find { it.speaker == src.asString }
}
