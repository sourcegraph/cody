package com.sourcegraph.cody.chat.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.util.IconUtil
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.PromptPanel
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag
import com.sourcegraph.cody.chat.ChatSession
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.context.ui.EnhancedContextPanel
import com.sourcegraph.cody.ui.ChatModel
import com.sourcegraph.cody.ui.ChatScrollPane
import com.sourcegraph.cody.ui.CodyModelComboboxItem
import com.sourcegraph.cody.ui.CodyModelComboboxRenderer
import com.sourcegraph.cody.vscode.CancellationToken
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JPanel

class ChatPanel(project: Project, chatSession: ChatSession) :
    JPanel(VerticalFlowLayout(VerticalFlowLayout.CENTER, 0, 0, true, false)) {

  val promptPanel: PromptPanel = PromptPanel(project, chatSession)
  val modelDropdown = ComboBox<CodyModelComboboxItem>()
  private val messagesPanel = MessagesPanel(project, chatSession)
  private val chatPanel = ChatScrollPane(messagesPanel)

  private val contextView: EnhancedContextPanel = EnhancedContextPanel(project, chatSession)

  private val stopGeneratingButton =
      object : JButton("Stop generating", IconUtil.desaturate(AllIcons.Actions.Suspend)) {
        init {
          isVisible = false
          layout = FlowLayout(FlowLayout.CENTER)
          minimumSize = Dimension(Short.MAX_VALUE.toInt(), 0)
          isOpaque = false
        }
      }

  init {
    layout = BorderLayout()
    border = BorderFactory.createEmptyBorder(0, 0, 0, 10)
    add(chatPanel, BorderLayout.CENTER)

    val lowerPanel = JPanel(VerticalFlowLayout(VerticalFlowLayout.BOTTOM, 10, 10, true, false))
    lowerPanel.add(stopGeneratingButton)
    lowerPanel.add(promptPanel)
    lowerPanel.add(contextView)
    add(lowerPanel, BorderLayout.SOUTH)
  }

  fun setAsActive() {
    contextView.setContextFromThisChatAsDefault()
    promptPanel.focus()
  }

  fun addModelDropdown(project: Project, sessionId: String, selectedModel: ChatModel?) {
    CodyAgentService.withAgent(project) { agent ->
      val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
      // Display available model for Enterprise user without possibility to change
      if (activeAccountType != null && !activeAccountType.isDotcomAccount()) {
        addAllAvailableModelsToTheDropdown(agent, sessionId)
        ApplicationManager.getApplication().invokeLater { modelDropdown.isEnabled = false }
      } else {
        agent.server.isCurrentUserPro().thenApplyAsync { isUserPro ->
          agent.server.evaluateFeatureFlag(GetFeatureFlag.CodyProTrialEnded).thenApplyAsync {
              trialEnded ->
            if (isUserPro && trialEnded == false) {
              if (selectedModel == null) {
                addAllAvailableModelsToTheDropdown(agent, sessionId)
              } else {
                // Here we handle adding model to the dropdown from state
                ApplicationManager.getApplication().invokeLater {
                  addEmptyModelDropdownWithRenderer()
                  modelDropdown.addItem(
                      CodyModelComboboxItem(selectedModel.icon, selectedModel.displayName))
                }
              }
            }
          }
        }
      }
    }
  }

  private fun addAllAvailableModelsToTheDropdown(agent: CodyAgent, sessionId: String) {
    val chatModels = agent.server.chatModels(ChatModelsParams(sessionId))
    chatModels.thenApplyAsync { response ->
      addEmptyModelDropdownWithRenderer()
      response.models.forEach { modelProvider ->
        val model = ChatModel.fromAgentName(modelProvider.model)
        ApplicationManager.getApplication().invokeLater {
          modelDropdown.addItem(
              CodyModelComboboxItem(
                  model.icon,
                  if (model == ChatModel.UNKNOWN_MODEL) modelProvider.model else model.displayName))
        }
      }
    }
  }

  private fun addEmptyModelDropdownWithRenderer() {
    ApplicationManager.getApplication().invokeLater {
      modelDropdown.setRenderer(CodyModelComboboxRenderer())
      add(modelDropdown, BorderLayout.NORTH)
    }
  }

  fun isEnhancedContextEnabled(): Boolean = contextView.isEnhancedContextEnabled.get()

  @RequiresEdt
  fun addOrUpdateMessage(
      message: ChatMessage,
      index: Int,
      shouldAddBlinkingCursor: Boolean = true
  ) {
    if (messagesPanel.componentCount == 1) {
      modelDropdown.isEnabled = false
    }
    promptPanel.updateEmptyTextAfterFirstMessage()
    messagesPanel.addOrUpdateMessage(message, index, shouldAddBlinkingCursor)
  }

  @RequiresEdt
  fun registerCancellationToken(cancellationToken: CancellationToken) {
    messagesPanel.registerCancellationToken(cancellationToken)
    promptPanel.registerCancellationToken(cancellationToken)

    cancellationToken.onFinished { stopGeneratingButton.isVisible = false }

    stopGeneratingButton.isVisible = true
    for (listener in stopGeneratingButton.actionListeners) {
      stopGeneratingButton.removeActionListener(listener)
    }
    stopGeneratingButton.addActionListener { cancellationToken.abort() }
  }
}
