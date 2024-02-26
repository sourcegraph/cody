package com.sourcegraph.cody.chat

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.history.state.ChatState
import java.util.concurrent.ConcurrentLinkedQueue

@Service(Service.Level.PROJECT)
class AgentChatSessionService(private val project: Project) {
  private val chatSessions: ConcurrentLinkedQueue<AgentChatSession> = ConcurrentLinkedQueue()

  fun addSession(session: AgentChatSession) {
    chatSessions.add(session)
  }

  fun removeAllSessions() {
    chatSessions.clear()
  }

  fun removeSession(state: ChatState): Boolean {
    val session = chatSessions.find { it.getInternalId() == state.internalId }
    return chatSessions.remove(session)
  }

  @RequiresEdt
  fun getOrCreateFromState(state: ChatState): AgentChatSession {
    val session = chatSessions.find { it.getInternalId() == state.internalId }
    return session ?: AgentChatSession.createFromState(project, state)
  }

  fun getSession(sessionId: SessionId): AgentChatSession? =
      chatSessions.find { it.hasSessionId(sessionId) }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): AgentChatSessionService {
      return project.service<AgentChatSessionService>()
    }
  }
}
