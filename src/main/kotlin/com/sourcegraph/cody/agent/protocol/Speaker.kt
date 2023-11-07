package com.sourcegraph.cody.agent.protocol

import com.google.gson.annotations.SerializedName

enum class Speaker {
  @SerializedName("human") HUMAN,
  @SerializedName("assistant") ASSISTANT
}
