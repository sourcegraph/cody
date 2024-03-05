package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.config.CodyAccount.Companion.isEnterpriseAccount
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.ui.LlmComboBoxRenderer
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.CodyBundle

data class LlmDropdownData(
    val models: List<ChatModelsResponse.ChatModelProvider>,
    val isCurrentUserFree: Boolean
)

class LlmDropdown(
    private val project: Project,
    private val onSetSelectedItem: (ChatModelsResponse.ChatModelProvider) -> Unit,
    private val chatModelProviderFromState: ChatModelsResponse.ChatModelProvider?,
) : ComboBox<ChatModelsResponse.ChatModelProvider>(MutableCollectionComboBoxModel()) {

  private var didSendFirstMessage: Boolean = false

  init {
    renderer = LlmComboBoxRenderer(this)
    if (chatModelProviderFromState != null) {
      addItem(chatModelProviderFromState)
    }

    isEnabled = false
  }

  @RequiresEdt
  fun updateModels(data: LlmDropdownData) {
    if (chatModelProviderFromState != null) {
      return
    }

    removeAllItems()
    (renderer as LlmComboBoxRenderer).isCurrentUserFree = data.isCurrentUserFree
    data.models.forEach(::addItem)
    data.models.find { it.default }?.let { this.selectedItem = it }

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
        if ((renderer as LlmComboBoxRenderer).isCurrentUserFree) {
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
      toolTipText = CodyBundle.getString("LlmDropdown.disabled.text")
    }
  }
}
