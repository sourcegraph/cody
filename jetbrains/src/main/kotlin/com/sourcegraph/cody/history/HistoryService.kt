package com.sourcegraph.cody.history

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.HistoryState

@State(name = "ChatHistory", storages = [Storage("cody_history.xml")])
@Service(Service.Level.PROJECT)
class HistoryService : SimplePersistentStateComponent<HistoryState>(HistoryState()) {

  @Synchronized
  fun getChatHistoryFor(accountId: String): List<ChatState>? = findEntry(accountId)?.chats

  private fun findEntry(accountId: String): AccountData? =
      state.accountData.find { it.accountId == accountId }

  companion object {
    @JvmStatic fun getInstance(project: Project): HistoryService = project.service<HistoryService>()
  }
}
