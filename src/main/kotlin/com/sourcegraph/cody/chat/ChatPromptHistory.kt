package com.sourcegraph.cody.chat

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.MessageState

class ChatPromptHistory(project: Project, chatSession: ChatSession, capacity: Int) :
    PromptHistory(capacity) {

  init {
    preloadHistoricalMessages(project, chatSession)
  }

  private fun preloadHistoricalMessages(project: Project, chatSession: ChatSession) {
    HistoryService.getInstance(project)
        .findActiveAccountChat(chatSession.getInternalId())
        ?.messages
        ?.filter { it.speaker == MessageState.SpeakerState.HUMAN }
        ?.mapNotNull { it.text }
        ?.forEach { add(it) }
  }
}
