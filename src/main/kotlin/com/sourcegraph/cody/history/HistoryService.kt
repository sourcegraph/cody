package com.sourcegraph.cody.history

import com.intellij.openapi.components.*
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.HistoryState
import com.sourcegraph.cody.history.state.MessageState
import java.time.LocalDateTime

@State(name = "ChatHistory", storages = [Storage("cody_history.xml")])
@Service(Service.Level.PROJECT)
class HistoryService : SimplePersistentStateComponent<HistoryState>(HistoryState()) {

  private val listeners = mutableListOf<(ChatState) -> Unit>()

  fun listenOnUpdate(listener: (ChatState) -> Unit) {
    synchronized(listeners) { listeners += listener }
  }

  fun update(internalId: String, chatMessages: List<ChatMessage>) {
    val found = getChatOrCreate(internalId)
    found.messages = chatMessages.map(::convertToMessageState).toMutableList()
    if (chatMessages.lastOrNull()?.speaker == Speaker.HUMAN) {
      found.setUpdatedTimeAt(LocalDateTime.now())
    }
    synchronized(listeners) { listeners.forEach { it(found) } }
  }

  fun remove(internalId: String?) {
    state.chats.removeIf { it.internalId == internalId }
  }

  private fun convertToMessageState(chatMessage: ChatMessage): MessageState {
    val message = MessageState()
    message.text = chatMessage.text
    message.speaker =
        when (chatMessage.speaker) {
          Speaker.HUMAN -> MessageState.SpeakerState.HUMAN
          Speaker.ASSISTANT -> MessageState.SpeakerState.ASSISTANT
        }
    return message
  }

  private fun getChatOrCreate(internalId: String): ChatState {
    val found = state.chats.find { it.internalId == internalId }
    if (found != null) return found
    val newChat = ChatState().also { it.internalId = internalId }
    state.chats += newChat
    return newChat
  }

  companion object {

    @JvmStatic fun getInstance() = service<HistoryService>()
  }
}
