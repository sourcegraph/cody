package com.sourcegraph.cody.history

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.HistoryState
import com.sourcegraph.cody.history.state.LLMState

@State(name = "ChatHistory", storages = [Storage("cody_history.xml")])
@Service(Service.Level.PROJECT)
class HistoryService(private val project: Project) :
    SimplePersistentStateComponent<HistoryState>(HistoryState()) {

  @Synchronized
  fun getDefaultLlm(): LLMState? {
    val account = CodyAuthenticationManager.getInstance().account
    val llm = account?.let { findEntry(it.id) }?.defaultLlm
    if (llm == null) return null
    return LLMState().also { it.copyFrom(llm) }
  }

  @Synchronized
  fun setDefaultLlm(defaultLlm: LLMState) {
    val newDefaultLlm = LLMState()
    newDefaultLlm.copyFrom(defaultLlm)
    getOrCreateActiveAccountEntry().defaultLlm = newDefaultLlm
  }

  @Synchronized
  fun remove(internalId: String?) {
    getOrCreateActiveAccountEntry().chats.removeIf { it.internalId == internalId }
  }

  @Synchronized
  fun findActiveAccountChat(internalId: String): ChatState? =
      getActiveAccountHistory()?.chats?.find { it.internalId == internalId }

  @Synchronized
  fun getChatHistoryFor(accountId: String): List<ChatState>? = findEntry(accountId)?.chats

  private fun findEntry(accountId: String): AccountData? =
      state.accountData.find { it.accountId == accountId }

  @Synchronized
  fun getActiveAccountHistory(): AccountData? =
      CodyAuthenticationManager.getInstance().account?.let { findEntry(it.id) }

  private fun getOrCreateActiveAccountEntry(): AccountData {
    val activeAccount =
        CodyAuthenticationManager.getInstance().account
            ?: throw IllegalStateException("No active account")

    val existingEntry = findEntry(activeAccount.id)
    return existingEntry ?: AccountData(activeAccount.id).also { state.accountData += it }
  }

  companion object {
    @JvmStatic fun getInstance(project: Project): HistoryService = project.service<HistoryService>()
  }
}
