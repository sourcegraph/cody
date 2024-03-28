package com.sourcegraph.cody.agent.protocol

data class ChatModelsParams(val modelUsage: String)

enum class ModelUsage(val value: String) {
  CHAT("chat"),
  EDIT("edit")
}
