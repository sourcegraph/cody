package com.sourcegraph.cody.chat

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.history.HistoryService
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

  fun getSession(connectionId: ConnectionId): AgentChatSession? =
      chatSessions.find { it.hasConnectionId(connectionId) }

  fun restoreAllSessions(agent: CodyAgent) {
    chatSessions.forEach { agentChatSession ->
      val chatState =
          HistoryService.getInstance(project).state.chats.find {
            it.internalId == agentChatSession.getInternalId()
          } ?: return

      agentChatSession.updateFromState(agent, chatState)
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): AgentChatSessionService {
      return project.service<AgentChatSessionService>()
    }
  }
}
