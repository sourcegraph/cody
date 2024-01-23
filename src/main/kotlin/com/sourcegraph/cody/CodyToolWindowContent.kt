package com.sourcegraph.cody

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.IconUtil
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.xml.util.XmlStringUtil
import com.sourcegraph.cody.agent.CodyAgentServer
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ContextMessage
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.chat.*
import com.sourcegraph.cody.commands.ui.CommandsTabPanel
import com.sourcegraph.cody.config.CodyAccount
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.context.ui.EnhancedContextPanel
import com.sourcegraph.cody.ui.ChatScrollPane
import com.sourcegraph.cody.ui.SendButton
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.telemetry.GraphQlLogger
import java.awt.*
import java.awt.event.ActionEvent
import java.util.*
import java.util.concurrent.ExecutionException
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(private val project: Project) : UpdatableChat {
  private val allContentLayout = CardLayout()
  private val allContentPanel = JPanel(allContentLayout)
  private val tabbedPane = JBTabbedPane()
  private val messagesPanel = JPanel()
  private val promptPanel: PromptPanel
  private val subscriptionPanel: SubscriptionTabPanel
  private val sendButton: JButton
  private var inProgressChat = CancellationToken()
  private val stopGeneratingButton =
      JButton("Stop generating", IconUtil.desaturate(AllIcons.Actions.Suspend))
  private val commandsPanel: CommandsTabPanel =
      CommandsTabPanel(project) { cmdId: CommandId ->
        ApplicationManager.getApplication().invokeLater {
          sendMessage(project, message = null, cmdId)
        }
      }
  val contextView: EnhancedContextPanel
  override var isChatVisible = false
  override var id: String? = null
  private var codyOnboardingGuidancePanel: CodyOnboardingGuidancePanel? = null
  private val chatMessageHistory = CodyChatMessageHistory(CHAT_MESSAGE_HISTORY_CAPACITY)

  init {
    // Tabs
    val contentPanel = JPanel()
    tabbedPane.insertTab(
        /* title = */ "Chat",
        /* icon = */ null,
        /* component = */ contentPanel,
        /* tip = */ null,
        CHAT_TAB_INDEX)

    tabbedPane.insertTab(
        /* title = */ "Commands",
        /* icon = */ null,
        /* component = */ commandsPanel,
        /* tip = */ null,
        RECIPES_TAB_INDEX)
    subscriptionPanel = SubscriptionTabPanel()
    // Chat panel
    messagesPanel.layout = VerticalFlowLayout(VerticalFlowLayout.TOP, 0, 0, true, true)
    val chatPanel = ChatScrollPane(messagesPanel)

    // Controls panel
    sendButton = createSendButton()
    promptPanel =
        PromptPanel(
            chatMessageHistory,
            ::sendChatMessage,
            sendButton,
            isGenerating = stopGeneratingButton::isVisible)
    val stopGeneratingButtonPanel = JPanel(FlowLayout(FlowLayout.CENTER, 0, 5))
    stopGeneratingButtonPanel.minimumSize = Dimension(Short.MAX_VALUE.toInt(), 0)
    stopGeneratingButton.addActionListener {
      inProgressChat.abort()
      stopGeneratingButton.isVisible = false
      sendButton.isEnabled = promptPanel.textArea.text.isNotBlank()
      ensureBlinkingCursorIsNotDisplayed()
      commandsPanel.enableAllButtons()
    }

    stopGeneratingButton.isVisible = false
    stopGeneratingButtonPanel.add(stopGeneratingButton)
    stopGeneratingButtonPanel.isOpaque = false
    contextView = EnhancedContextPanel(project)
    val lowerPanel = LowerPanel(stopGeneratingButtonPanel, promptPanel, contextView)

    // Main content panel
    contentPanel.layout = BorderLayout(0, 0)
    contentPanel.border = BorderFactory.createEmptyBorder(0, 0, 10, 0)
    contentPanel.add(chatPanel, BorderLayout.CENTER)
    contentPanel.add(lowerPanel, BorderLayout.SOUTH)
    tabbedPane.addChangeListener { focusPromptInput() }
    val singInWithSourcegraphPanel = SignInWithSourcegraphPanel(project)
    allContentPanel.add(tabbedPane, "tabbedPane", CHAT_PANEL_INDEX)
    allContentPanel.add(
        singInWithSourcegraphPanel, SING_IN_WITH_SOURCEGRAPH_PANEL, SIGN_IN_PANEL_INDEX)
    allContentLayout.show(allContentPanel, SING_IN_WITH_SOURCEGRAPH_PANEL)
    refreshPanelsVisibility()

    addWelcomeMessage()

    ApplicationManager.getApplication().executeOnPooledThread {
      refreshSubscriptionTab()
      loadNewChatId()
    }
  }

  @RequiresBackgroundThread
  fun refreshSubscriptionTab() {
    CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
      fetchSubscriptionPanelData(project, agent.server).thenAccept {
        if (it != null) {

          ApplicationManager.getApplication().invokeLater { refreshSubscriptionTab(it) }
        }
      }
    }
  }

  @RequiresEdt
  private fun refreshSubscriptionTab(data: SubscriptionTabPanelData) {
    val isSubscriptionTabPresent = tabbedPane.tabCount >= SUBSCRIPTION_TAB_INDEX + 1

    if (data.isDotcomAccount && data.codyProFeatureFlag) {
      if (!isSubscriptionTabPresent) {
        tabbedPane.insertTab(
            /* title = */ "Subscription",
            /* icon = */ null,
            /* component = */ subscriptionPanel,
            /* tip = */ null,
            SUBSCRIPTION_TAB_INDEX)
      }
      subscriptionPanel.update(data.isCurrentUserPro)
    } else if (isSubscriptionTabPresent) {
      tabbedPane.remove(SUBSCRIPTION_TAB_INDEX)
    }
  }

  override fun loadNewChatId(callback: () -> Unit) {
    id = null

    ApplicationManager.getApplication().invokeLater {
      promptPanel.textArea.isEnabled = false
      promptPanel.textArea.emptyText.text = "Connecting to agent..."
    }

    CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
      try {
        id = agent.server.chatNew().get()
        ApplicationManager.getApplication().invokeLater {
          promptPanel.textArea.isEnabled = true
          promptPanel.textArea.emptyText.text = "Ask a question about this code..."
        }
        callback.invoke()
      } catch (e: ExecutionException) {
        // Agent cannot gracefully recover when connection is lost, we need to restart it
        // TODO https://github.com/sourcegraph/jetbrains/issues/306
        logger.warn("Failed to load new chat, restarting agent", e)
        CodyAgentService.getInstance(project).restartAgent(project)
        Thread.sleep(5000)
        loadNewChatId(callback)
      }
    }
  }

  private fun getUserId(server: CodyAgentServer): String? {
    return server
        .currentUserId()
        .exceptionally {
          logger.warn("Unable to fetch user id from agent")
          null
        }
        .get()
  }

  @RequiresEdt
  override fun refreshPanelsVisibility() {
    val codyAuthenticationManager = CodyAuthenticationManager.instance
    if (codyAuthenticationManager.getAccounts().isEmpty()) {
      allContentLayout.show(allContentPanel, SING_IN_WITH_SOURCEGRAPH_PANEL)
      isChatVisible = false
      return
    }
    val activeAccount = codyAuthenticationManager.getActiveAccount(project)
    if (!CodyApplicationSettings.instance.isOnboardingGuidanceDismissed) {
      val displayName = activeAccount?.let(CodyAccount::displayName)
      val newCodyOnboardingGuidancePanel = CodyOnboardingGuidancePanel(displayName)
      newCodyOnboardingGuidancePanel.addMainButtonActionListener {
        CodyApplicationSettings.instance.isOnboardingGuidanceDismissed = true
        refreshPanelsVisibility()
      }
      if (displayName != null) {
        if (codyOnboardingGuidancePanel?.originalDisplayName?.let { it != displayName } == true)
            try {
              allContentPanel.remove(ONBOARDING_PANEL_INDEX)
            } catch (ex: Throwable) {
              // ignore because panel was not created before
            }
      }
      codyOnboardingGuidancePanel = newCodyOnboardingGuidancePanel
      allContentPanel.add(codyOnboardingGuidancePanel, ONBOARDING_PANEL, ONBOARDING_PANEL_INDEX)
      allContentLayout.show(allContentPanel, ONBOARDING_PANEL)
      isChatVisible = false
      return
    }
    allContentLayout.show(allContentPanel, "tabbedPane")
    isChatVisible = true
  }

  private fun addWelcomeMessage() {
    val welcomeText =
        "Hello! I'm Cody. I can write code and answer questions for you. See [Cody documentation](https://sourcegraph.com/docs/cody) for help and tips."
    addMessageToChat(ChatMessage(Speaker.ASSISTANT, welcomeText))
  }

  private fun createSendButton(): JButton {
    val myButton = SendButton()

    myButton.addActionListener { _: ActionEvent? ->
      GraphQlLogger.logCodyEvent(this.project, "recipe:chat-question", "clicked")
      sendChatMessage()
    }

    return myButton
  }

  @Synchronized
  override fun addMessageToChat(message: ChatMessage, shouldDisplayBlinkingCursor: Boolean) {
    ApplicationManager.getApplication().invokeLater {

      // Bubble panel
      val messagePanel =
          MessagePanel(
              message, project, messagesPanel, ChatUIConstants.ASSISTANT_MESSAGE_GRADIENT_WIDTH)
      addComponentToChat(messagePanel)
      ensureBlinkingCursorIsNotDisplayed()
      if (shouldDisplayBlinkingCursor) {
        messagesPanel.add(BlinkingCursorComponent.instance)
        BlinkingCursorComponent.instance.timer.start()
      }
    }
  }

  private fun addComponentToChat(messageContent: JPanel) {
    val wrapperPanel = JPanel()
    wrapperPanel.layout = VerticalFlowLayout(VerticalFlowLayout.TOP, 0, 0, true, false)
    // Chat message
    wrapperPanel.add(messageContent, VerticalFlowLayout.TOP)
    messagesPanel.add(wrapperPanel)
    messagesPanel.revalidate()
    messagesPanel.repaint()
  }

  override fun activateChatTab() {
    tabbedPane.selectedIndex = CHAT_TAB_INDEX
  }

  @Synchronized
  override fun updateLastMessage(message: ChatMessage) {
    ApplicationManager.getApplication().invokeLater {
      Optional.of(messagesPanel)
          .filter { mp: JPanel -> mp.componentCount > 0 }
          .map { mp: JPanel -> mp.getComponent(mp.componentCount - 1) }
          .filter { component: Component? -> component is JPanel }
          .map { component: Component -> component as JPanel }
          .map { lastWrapperPanel: JPanel -> lastWrapperPanel.getComponent(0) }
          .filter { component: Component? -> component is MessagePanel }
          .map { component: Component -> component as MessagePanel }
          .ifPresent { lastMessage: MessagePanel -> lastMessage.updateContentWith(message) }
    }
  }

  private fun startMessageProcessing() {
    inProgressChat = CancellationToken()
    ApplicationManager.getApplication().invokeLater {
      stopGeneratingButton.isVisible = true
      sendButton.isEnabled = false
      commandsPanel.disableAllButtons()
    }
  }

  override fun finishMessageProcessing() {
    ApplicationManager.getApplication().invokeLater {
      ensureBlinkingCursorIsNotDisplayed()
      stopGeneratingButton.isVisible = false
      sendButton.isEnabled = promptPanel.textArea.text.isNotBlank()
      commandsPanel.enableAllButtons()
    }
  }

  override fun resetConversation() {
    ApplicationManager.getApplication().invokeLater {
      stopGeneratingButton.isVisible = false
      messagesPanel.removeAll()
      addWelcomeMessage()
      messagesPanel.revalidate()
      messagesPanel.repaint()
      chatMessageHistory.clearHistory()
      // todo (#260): call agent to reset the transcript instead of unsetting the chat id
      inProgressChat.abort()
      loadNewChatId()
      ensureBlinkingCursorIsNotDisplayed()
    }
  }

  private fun ensureBlinkingCursorIsNotDisplayed() {
    Arrays.stream(messagesPanel.components)
        .filter { x: Component -> x === BlinkingCursorComponent.instance }
        .forEach { messagesPanel.remove(BlinkingCursorComponent.instance) }
    BlinkingCursorComponent.instance.timer.stop()
  }

  @RequiresEdt
  private fun sendChatMessage() {
    val text = promptPanel.textArea.text
    chatMessageHistory.messageSent(text)
    sendMessage(project, text, commandId = null)
    promptPanel.reset()
  }

  @RequiresEdt
  private fun sendMessage(project: Project, message: String?, commandId: CommandId?) {
    startMessageProcessing()
    val displayText = XmlStringUtil.escapeString(message)
    val humanMessage = ChatMessage(Speaker.HUMAN, message, displayText)
    addMessageToChat(humanMessage, shouldDisplayBlinkingCursor = true)
    activateChatTab()

    // This cannot run on EDT (Event Dispatch Thread) because it may block for a long time.
    // Also, if we did the back-end call in the main thread and then waited, we wouldn't see the
    // messages streamed back to us.
    ApplicationManager.getApplication().executeOnPooledThread {
      val chat = Chat()
      try {
        chat.sendMessageViaAgent(
            project,
            humanMessage,
            commandId,
            this,
            inProgressChat,
            contextView.isEnhancedContextEnabled.get())
      } catch (e: Exception) {
        logger.error("Error sending message '$humanMessage' to chat", e)
        addMessageToChat(
            ChatMessage(
                Speaker.ASSISTANT,
                "Cody is not able to reply at the moment. " +
                    "This is a bug, please report an issue to https://github.com/sourcegraph/cody/issues/new?template=bug_report.yml " +
                    "and include as many details as possible to help troubleshoot the problem."))
        finishMessageProcessing()
      }
    }
    GraphQlLogger.logCodyEvent(this.project, "command:chat-question", "executed")
  }

  override fun displayUsedContext(contextMessages: List<ContextMessage>) {
    if (contextMessages.isEmpty()) {
      // Do nothing when there are no context files. It's normal that some answers have no context
      // files.
      return
    }
    val contextFilesMessage = ContextFilesMessage(project, contextMessages)
    val messageContentPanel = JPanel(BorderLayout())
    messageContentPanel.add(contextFilesMessage)
    addComponentToChat(messageContentPanel)
  }

  val contentPanel: JComponent
    get() = allContentPanel

  private fun focusPromptInput() {
    if (tabbedPane.selectedIndex == CHAT_TAB_INDEX) {
      promptPanel.textArea.requestFocusInWindow()
      val textLength = promptPanel.textArea.document.length
      promptPanel.textArea.caretPosition = textLength
    }
  }

  val preferredFocusableComponent: JComponent?
    get() = if (tabbedPane.selectedIndex == CHAT_TAB_INDEX) promptPanel.textArea else null

  fun addToTabbedPaneChangeListener(myAction: () -> Unit) =
      tabbedPane.addChangeListener { myAction() }

  companion object {
    const val ONBOARDING_PANEL = "onboardingPanel"
    const val CHAT_PANEL_INDEX = 0
    const val SIGN_IN_PANEL_INDEX = 1
    const val ONBOARDING_PANEL_INDEX = 2
    var logger = Logger.getInstance(CodyToolWindowContent::class.java)
    const val SING_IN_WITH_SOURCEGRAPH_PANEL = "singInWithSourcegraphPanel"
    private const val CHAT_TAB_INDEX = 0
    private const val RECIPES_TAB_INDEX = 1
    private const val SUBSCRIPTION_TAB_INDEX = 2
    private const val CHAT_MESSAGE_HISTORY_CAPACITY = 100

    fun executeOnInstanceIfNotDisposed(
        project: Project,
        myAction: CodyToolWindowContent.() -> Unit
    ) {
      if (!project.isDisposed) {
        val codyToolWindowContent = project.getService(CodyToolWindowContent::class.java)
        codyToolWindowContent.myAction()
      }
    }
  }
}
