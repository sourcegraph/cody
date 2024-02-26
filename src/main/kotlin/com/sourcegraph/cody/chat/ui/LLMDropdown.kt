package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.chat.SessionId
import com.sourcegraph.cody.config.CodyAccount.Companion.isEnterpriseAccount
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.ui.LLMComboBoxRenderer
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.CodyBundle
import java.util.concurrent.TimeUnit

class LLMDropdown(
    val project: Project,
    private val onSetSelectedItem: (ChatModelsResponse.ChatModelProvider) -> Unit,
    private val chatModelProviderFromState: ChatModelsResponse.ChatModelProvider?,
) : ComboBox<ChatModelsResponse.ChatModelProvider>(MutableCollectionComboBoxModel()) {

  private var didSendFirstMessage: Boolean = false

  init {
    renderer = LLMComboBoxRenderer(this)
    if (chatModelProviderFromState != null) {
      addItem(chatModelProviderFromState)
    }

    isEnabled = false
  }

  fun fetchAndUpdateModels(sessionId: SessionId) {
    if (chatModelProviderFromState != null) {
      return
    }

    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chatModels(ChatModelsParams(sessionId))
      val response =
          chatModels.completeOnTimeout(null, 4, TimeUnit.SECONDS).get() ?: return@withAgent

      val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
      val isCurrentUserFree =
          if (activeAccountType?.isDotcomAccount() == true) {
            agent.server.isCurrentUserPro().completeOnTimeout(false, 4, TimeUnit.SECONDS).get() ==
                false
          } else false
      ApplicationManager.getApplication().invokeLater {
        updateModels(response.models, isCurrentUserFree)
      }
    }
  }

  @RequiresEdt
  private fun updateModels(
      models: List<ChatModelsResponse.ChatModelProvider>,
      isCurrentUserFree: Boolean
  ) {
    removeAllItems()
    (renderer as LLMComboBoxRenderer).isCurrentUserFree = isCurrentUserFree
    models.forEach(::addItem)
    models.find { it.default }?.let { this.selectedItem = it }

    val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
    isEnabled =
        !didSendFirstMessage && !(activeAccountType.isEnterpriseAccount() || model.size <= 1)
  }

  override fun getModel(): MutableCollectionComboBoxModel<ChatModelsResponse.ChatModelProvider> {
    return super.getModel() as MutableCollectionComboBoxModel
  }

  override fun setSelectedItem(anObject: Any?) {
    val modelProvider = anObject as? ChatModelsResponse.ChatModelProvider
    if (modelProvider != null) {
      if (modelProvider.codyProOnly) {
        if ((renderer as LLMComboBoxRenderer).isCurrentUserFree) {
          BrowserOpener.openInBrowser(project, "https://sourcegraph.com/cody/subscription")
          return
        }
      }
      super.setSelectedItem(anObject)
      onSetSelectedItem(modelProvider)
    }
  }

  fun updateAfterFirstMessage() {
    didSendFirstMessage = true
    isEnabled = false

    val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
    if (activeAccountType?.isDotcomAccount() == true) {
      toolTipText = CodyBundle.getString("LLMDropdown.disabled.text")
    }
  }
}
