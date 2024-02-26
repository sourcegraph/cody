package com.sourcegraph.cody.agent.protocol

data class ChatRestoreParams(
    val modelID: String?,
    val messages: List<ChatMessage>,
    val chatID: String
)
