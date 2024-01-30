package com.sourcegraph.cody.agent.protocol

data class ChatModelsResponse(val models: List<ChatModelProvider>) {

  data class ChatModelProvider(
      val default: Boolean,
      val codyProOnly: Boolean,
      val provider: String,
      val title: String,
      val model: String
  )
}
