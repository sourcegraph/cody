package com.sourcegraph.cody.history

import com.intellij.openapi.components.*
import com.intellij.openapi.project.Project
import com.jetbrains.rd.framework.base.deepClonePolymorphic
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.HistoryState
import com.sourcegraph.cody.history.state.MessageState
import java.time.LocalDateTime

@State(name = "ChatHistory", storages = [Storage("cody_history.xml")])
@Service(Service.Level.PROJECT)
class HistoryService(private val project: Project) :
    SimplePersistentStateComponent<HistoryState>(HistoryState()) {

  private val listeners = mutableListOf<(ChatState) -> Unit>()

  fun listenOnUpdate(listener: (ChatState) -> Unit) {
    synchronized(listeners) { listeners += listener }
  }

  @Synchronized
  fun updateChatMessages(internalId: String, chatMessages: List<ChatMessage>) {
    val found = getOrCreateChat(internalId)
    found.messages = chatMessages.map(::convertToMessageState).toMutableList()
    if (chatMessages.lastOrNull()?.speaker == Speaker.HUMAN) {
      found.setUpdatedTimeAt(LocalDateTime.now())
    }
    synchronized(listeners) { listeners.forEach { it(found) } }
  }

  @Synchronized
  fun updateContextState(internalId: String, contextState: EnhancedContextState?) {
    val found = getOrCreateChat(internalId)
    if (found.enhancedContext == null || contextState == null) {
      found.enhancedContext = EnhancedContextState()
    }
    if (contextState != null) {
      found.enhancedContext?.copyFrom(contextState)
    }
  }

  @Synchronized
  fun updateDefaultContextState(contextState: EnhancedContextState) {
    if (state.defaultEnhancedContext == null) {
      state.defaultEnhancedContext = EnhancedContextState()
    }
    state.defaultEnhancedContext?.copyFrom(contextState)
  }

  @Synchronized
  fun getOrCreateChatReadOnly(internalId: String): ChatState {
    return getOrCreateChat(internalId).deepClonePolymorphic()
  }

  @Synchronized
  fun getHistoryReadOnly(): HistoryState {
    return state.deepClonePolymorphic()
  }

  @Synchronized
  fun remove(internalId: String?) {
    state.chats.removeIf { it.internalId == internalId }
  }

  fun removeAll() {
    state.chats = mutableListOf()
  }

  private fun convertToMessageState(chatMessage: ChatMessage): MessageState {
    val message =
        MessageState().also {
          it.text = chatMessage.text
          it.speaker =
              when (chatMessage.speaker) {
                Speaker.HUMAN -> MessageState.SpeakerState.HUMAN
                Speaker.ASSISTANT -> MessageState.SpeakerState.ASSISTANT
              }
        }
    return message
  }

  private fun getOrCreateChat(internalId: String): ChatState {
    val found = state.chats.find { it.internalId == internalId }
    if (found != null) return found
    val activeAccountId = CodyAuthenticationManager.instance.getActiveAccount(project)?.id
    val newChat = ChatState.create(activeAccountId, internalId)
    state.chats += newChat
    return newChat
  }

  companion object {
    @JvmStatic fun getInstance(project: Project): HistoryService = project.service<HistoryService>()
  }
}
