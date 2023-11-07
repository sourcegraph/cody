package com.sourcegraph.cody.agent.protocol

data class ChatMessage(
    override val speaker: Speaker,
    override val text: String?,
    val displayText: String? = null,
    val contextFiles: List<ContextFile>? = null
) : Message {
  fun actualMessage(): String = displayText ?: text ?: ""
}
