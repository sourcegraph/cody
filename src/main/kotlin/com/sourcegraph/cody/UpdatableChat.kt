package com.sourcegraph.cody

import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ContextMessage

interface UpdatableChat {
  fun addMessageToChat(message: ChatMessage, shouldDisplayBlinkingCursor: Boolean = false)

  fun updateLastMessage(message: ChatMessage)

  fun displayUsedContext(contextMessages: List<ContextMessage?>)

  fun finishMessageProcessing()

  fun resetConversation()

  fun refreshPanelsVisibility()

  val isChatVisible: Boolean

  var id: String?

  fun activateChatTab()

  fun loadNewChatId(callback: () -> Unit = {})
}
