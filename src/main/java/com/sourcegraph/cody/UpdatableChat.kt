package com.sourcegraph.cody

import com.sourcegraph.cody.chat.ChatMessage
import com.sourcegraph.cody.context.ContextMessage

interface UpdatableChat {
  fun addMessageToChat(message: ChatMessage, shouldDisplayBlinkingCursor: Boolean = false)

  fun updateLastMessage(message: ChatMessage)

  fun displayUsedContext(contextMessages: List<ContextMessage?>)

  fun finishMessageProcessing()

  fun resetConversation()

  fun refreshPanelsVisibility()

  val isChatVisible: Boolean

  fun activateChatTab()
}
