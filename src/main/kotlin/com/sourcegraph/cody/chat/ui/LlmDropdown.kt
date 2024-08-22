package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.ConfigFeatures
import com.sourcegraph.cody.agent.CurrentConfigFeatures
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.agent.protocol_extensions.isCodyProOnly
import com.sourcegraph.cody.agent.protocol_extensions.isDeprecated
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsParams
import com.sourcegraph.cody.agent.protocol_generated.Model
import com.sourcegraph.cody.config.AccountTier
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.cody.ui.LlmComboBoxRenderer
import com.sourcegraph.common.BrowserOpener
import java.util.concurrent.TimeUnit

class LlmDropdown(
    private val modelUsage: ModelUsage,
    private val project: Project,
    private val onSetSelectedItem: (Model) -> Unit,
    val parentDialog: EditCommandPrompt?,
    private val chatModelFromState: Model?,
    private val model: String? = null
) : ComboBox<Model>(MutableCollectionComboBoxModel()) {
  private var hasServerSentModels = false

  init {
    renderer = LlmComboBoxRenderer(this)
    isVisible = false
    isOpaque = false

    subscribeToFeatureUpdates()
    updateModels()
  }

  private fun updateModels() {
    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chat_models(Chat_ModelsParams(modelUsage.value))
      val models =
          chatModels.completeOnTimeout(null, 10, TimeUnit.SECONDS).get()?.models ?: return@withAgent

      invokeLater { updateModelsInUI(models) }
    }
  }

  private fun subscribeToFeatureUpdates() {
    val currentConfigFeatures: CurrentConfigFeatures =
        project.getService(CurrentConfigFeatures::class.java)
    currentConfigFeatures.attach(::handleConfigUpdate)
  }

  private fun handleConfigUpdate(config: ConfigFeatures) {
    hasServerSentModels = config.serverSentModels
    if (!isVisible && config.serverSentModels) {
      isVisible = true
      revalidate()
    }
  }

  @RequiresEdt
  private fun updateModelsInUI(models: List<Model>) {
    if (project.isDisposed) return
    this.removeAllItems()

    val availableModels = models.filterNot { it.isDeprecated() }
    availableModels.sortedBy { it.isCodyProOnly() }.forEach(::addItem)

    val selectedFromChatState = chatModelFromState
    val selectedFromHistory = HistoryService.getInstance(project).getDefaultLlm()

    selectedItem =
        models.find {
          it.id == model ||
              it.id == selectedFromHistory?.model ||
              it.id == selectedFromChatState?.id
        } ?: models.firstOrNull()

    val isEnterpriseAccount =
        CodyAuthenticationManager.getInstance(project).account?.isEnterpriseAccount() ?: false

    // If the dropdown is already disabled, don't change it. It can happen
    // in the case of the legacy commands (updateAfterFirstMessage happens before this call).
    isEnabled = isEnabled && chatModelFromState == null

    isVisible = !isEnterpriseAccount || hasServerSentModels
    setMaximumRowCount(15)

    revalidate()
  }

  override fun getModel(): MutableCollectionComboBoxModel<Model> {
    return super.getModel() as MutableCollectionComboBoxModel
  }

  @RequiresEdt
  override fun setSelectedItem(anObject: Any?) {
    if (project.isDisposed) return
    val modelProvider = anObject as? Model
    if (modelProvider != null) {
      if (modelProvider.isCodyProOnly() && isCurrentUserFree()) {
        BrowserOpener.openInBrowser(project, "https://sourcegraph.com/cody/subscription")
        return
      }

      HistoryService.getInstance(project).setDefaultLlm(LLMState.fromChatModel(modelProvider))

      super.setSelectedItem(anObject)
      onSetSelectedItem(modelProvider)
    }
  }

  fun isCurrentUserFree(): Boolean =
      CodyAuthenticationManager.getInstance(project)
          .getActiveAccountTier()
          .getNow(AccountTier.DOTCOM_FREE) == AccountTier.DOTCOM_FREE
}
