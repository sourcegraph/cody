package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonPrimitive
import com.google.gson.JsonSerializer
import com.google.gson.annotations.SerializedName

enum class Speaker(val speaker: String) {
  @SerializedName("human") HUMAN("human"),
  @SerializedName("assistant") ASSISTANT("assistant")
}

val SpeakerSerializer = JsonSerializer<Speaker> { src, _, _ -> JsonPrimitive(src.speaker) }
