package com.sourcegraph.cody.config.migration

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Chat_ImportParams
import com.sourcegraph.cody.agent.protocol_generated.SerializedChatInteraction
import com.sourcegraph.cody.agent.protocol_generated.SerializedChatMessage
import com.sourcegraph.cody.agent.protocol_generated.SerializedChatTranscript
import com.sourcegraph.cody.auth.deprecated.DeprecatedCodyAccount
import com.sourcegraph.cody.auth.deprecated.DeprecatedCodyAccountManager
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.MessageState

// Copies chat history from locally stored jetbrains state to the cody agent
// so historical chats can be viewed in the cody webview
object ChatHistoryMigration {
  fun migrate(project: Project) {
    CodyAgentService.withAgent(project) { agent ->
      val chats =
          DeprecatedCodyAccountManager.getInstance().getAccounts().associateWith { account ->
            (HistoryService.getInstance(project).getChatHistoryFor(account.id) ?: listOf())
          }
      val history = toChatInput(chats)

      agent.server.chat_import(Chat_ImportParams(history = history, merge = true)).get()
    }
  }

  fun toChatInput(
      chats: Map<DeprecatedCodyAccount, List<ChatState>>
  ): Map<String, Map<String, SerializedChatTranscript>> {
    return chats
        .map { (account, chats) ->
          val serializedChats = chats.mapNotNull(::toSerializedChatTranscript)
          val byTimestamp = serializedChats.associateBy { it.lastInteractionTimestamp }

          "${account.server.url}-${account.name}" to byTimestamp
        }
        .toMap()
  }

  private fun toSerializedChatTranscript(chat: ChatState): SerializedChatTranscript? {
    return SerializedChatTranscript(
        id = chat.updatedAt ?: return null,
        lastInteractionTimestamp = chat.updatedAt ?: return null,
        interactions = toSerializedInteractions(chat.messages, chat.llm?.model),
    )
  }
}

private fun toSerializedInteractions(
    messages: List<MessageState>,
    model: String?
): List<SerializedChatInteraction> {
  fun toChatMessage(message: MessageState): SerializedChatMessage? {
    return SerializedChatMessage(
        text = message.text ?: return null,
        model = model,
        speaker =
            when (message.speaker) {
              MessageState.SpeakerState.HUMAN -> SerializedChatMessage.SpeakerEnum.Human
              MessageState.SpeakerState.ASSISTANT -> SerializedChatMessage.SpeakerEnum.Assistant
              null -> return null
            },
    )
  }

  fun toInteraction(pair: List<SerializedChatMessage?>): SerializedChatInteraction? {
    val (human, assistant) = pair.getOrNull(0) to pair.getOrNull(1)
    if (human == null ||
        human.speaker != SerializedChatMessage.SpeakerEnum.Human ||
        assistant?.speaker != SerializedChatMessage.SpeakerEnum.Assistant) {
      return null
    }
    return SerializedChatInteraction(humanMessage = human, assistantMessage = assistant)
  }

  return messages.map(::toChatMessage).chunked(2).mapNotNull(::toInteraction)
}
