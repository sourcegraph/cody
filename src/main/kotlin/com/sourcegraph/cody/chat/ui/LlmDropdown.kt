package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.config.AccountTier
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.cody.ui.LlmComboBoxRenderer
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.CodyBundle
import java.util.concurrent.TimeUnit

class LlmDropdown(
    private val modelUsage: ModelUsage,
    private val project: Project,
    private val onSetSelectedItem: (ChatModelsResponse.ChatModelProvider) -> Unit,
    val parentDialog: EditCommandPrompt?,
    val chatModelProviderFromState: ChatModelsResponse.ChatModelProvider?,
) : ComboBox<ChatModelsResponse.ChatModelProvider>(MutableCollectionComboBoxModel()) {

  init {
    renderer = LlmComboBoxRenderer(this)
    isVisible = false
    isOpaque = false

    updateModels()
  }

  private fun updateModels() {
    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chatModels(ChatModelsParams(modelUsage.value))
      val response =
          chatModels.completeOnTimeout(null, 10, TimeUnit.SECONDS).get() ?: return@withAgent

      invokeLater { updateModelsInUI(response.models) }
    }
  }

  @RequiresEdt
  private fun updateModelsInUI(models: List<ChatModelsResponse.ChatModelProvider>) {
    if (project.isDisposed) return

    models.filterNot { it.deprecated }.sortedBy { it.codyProOnly }.forEach(::addItem)

    val selectedFromState = chatModelProviderFromState
    val selectedFromHistory = HistoryService.getInstance(project).getDefaultLlm()
    selectedItem =
        models.find { it.model == selectedFromState?.model && !it.deprecated }
            ?: models.find { it.model == selectedFromHistory?.model && !it.deprecated }
            ?: models.find { it.default }

    val isEnterpriseAccount =
        CodyAuthenticationManager.getInstance(project).getActiveAccount()?.isEnterpriseAccount()
            ?: false

    // If the dropdown is already disabled, don't change it. It can happen
    // in the case of the legacy commands (updateAfterFirstMessage happens before this call).
    isEnabled = isEnabled && chatModelProviderFromState == null
    isVisible = !isEnterpriseAccount
    setMaximumRowCount(15)

    revalidate()
  }

  override fun getModel(): MutableCollectionComboBoxModel<ChatModelsResponse.ChatModelProvider> {
    return super.getModel() as MutableCollectionComboBoxModel
  }

  @RequiresEdt
  override fun setSelectedItem(anObject: Any?) {
    if (project.isDisposed) return
    val modelProvider = anObject as? ChatModelsResponse.ChatModelProvider
    if (modelProvider != null) {
      if (modelProvider.codyProOnly && isCurrentUserFree()) {
        BrowserOpener.openInBrowser(project, "https://sourcegraph.com/cody/subscription")
        return
      }

      HistoryService.getInstance(project).setDefaultLlm(LLMState.fromChatModel(modelProvider))

      super.setSelectedItem(anObject)
      onSetSelectedItem(modelProvider)
    }
  }

  fun isCurrentUserFree(): Boolean {
    return CodyAuthenticationManager.getInstance(project)
        .getActiveAccountTier()
        .getNow(AccountTier.DOTCOM_FREE) === AccountTier.DOTCOM_FREE
  }

  @RequiresEdt
  fun updateAfterFirstMessage() {
    isEnabled = false

    val activeAccountType = CodyAuthenticationManager.getInstance(project).getActiveAccount()
    if (activeAccountType?.isDotcomAccount() == true) {
      toolTipText = CodyBundle.getString("LlmDropdown.disabled.text")
    }
  }
}
