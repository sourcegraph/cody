package com.sourcegraph.cody.chat.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.util.IconUtil
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.PromptPanel
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.chat.ChatSession
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.context.ui.EnhancedContextPanel
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.cody.ui.ChatScrollPane
import com.sourcegraph.cody.vscode.CancellationToken
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JPanel

class ChatPanel(
    val project: Project,
    val chatSession: ChatSession,
    chatModelProviderFromState: ChatModelsResponse.ChatModelProvider?
) : JPanel(VerticalFlowLayout(VerticalFlowLayout.CENTER, 0, 0, true, false)) {

  val promptPanel: PromptPanel = PromptPanel(project, chatSession)
  private val llmDropdown =
      LlmDropdown(
          ModelUsage.CHAT,
          project,
          onSetSelectedItem = ::setLlmForAgentSession,
          parentDialog = null,
          chatModelProviderFromState)
  private val messagesPanel = MessagesPanel(project, chatSession)
  private val chatPanel = ChatScrollPane(messagesPanel)

  internal val contextView: EnhancedContextPanel = EnhancedContextPanel.create(project, chatSession)

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

    val wrapper = JPanel()
    wrapper.add(llmDropdown)
    wrapper.layout = VerticalFlowLayout(VerticalFlowLayout.TOP, 12, 12, true, false)

    add(lowerPanel, BorderLayout.SOUTH)
    add(wrapper, BorderLayout.NORTH)
  }

  fun setAsActive() {
    contextView.setContextFromThisChatAsDefault()
    promptPanel.focus()
  }

  fun isEnhancedContextEnabled(): Boolean = contextView.isEnhancedContextEnabled

  @RequiresEdt
  fun addOrUpdateMessage(message: ChatMessage, index: Int) {
    val numberOfMessagesBeforeAddOrUpdate = messagesPanel.componentCount
    if (numberOfMessagesBeforeAddOrUpdate == 1) {
      llmDropdown.updateAfterFirstMessage()
      promptPanel.updateEmptyTextAfterFirstMessage()
    }
    messagesPanel.addOrUpdateMessage(message, index)
    if (numberOfMessagesBeforeAddOrUpdate < messagesPanel.componentCount) {
      chatPanel.touchingBottom = true
    }
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

  private fun setLlmForAgentSession(chatModelProvider: ChatModelsResponse.ChatModelProvider) {
    val activeAccountType = CodyAuthenticationManager.getInstance(project).getActiveAccount()
    if (activeAccountType?.isEnterpriseAccount() == true) {
      // no need to send the webview message since the chat model is set by default
    } else {
      chatSession.sendWebviewMessage(
          WebviewMessage(command = "chatModel", model = chatModelProvider.model))
    }

    HistoryService.getInstance(project)
        .updateChatLlmProvider(
            chatSession.getInternalId(), LLMState.fromChatModel(chatModelProvider))
  }
}
