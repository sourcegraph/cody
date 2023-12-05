package com.sourcegraph.cody

import com.intellij.icons.AllIcons
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.actionSystem.*
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.IconUtil
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBUI
import com.intellij.xml.util.XmlStringUtil
import com.sourcegraph.cody.agent.CodyAgent.Companion.getClient
import com.sourcegraph.cody.agent.CodyAgent.Companion.getInitializedServer
import com.sourcegraph.cody.agent.CodyAgent.Companion.getServer
import com.sourcegraph.cody.agent.CodyAgent.Companion.isConnected
import com.sourcegraph.cody.agent.CodyAgentManager.tryRestartingAgentIfNotRunning
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ContextMessage
import com.sourcegraph.cody.agent.protocol.RecipeInfo
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.autocomplete.CodyEditorFactoryListener
import com.sourcegraph.cody.chat.*
import com.sourcegraph.cody.config.CodyAccount
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.context.EmbeddingStatusView
import com.sourcegraph.cody.ui.ChatScrollPane
import com.sourcegraph.cody.ui.SendButton
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.telemetry.GraphQlLogger
import java.awt.*
import java.awt.event.ActionEvent
import java.util.*
import java.util.stream.Collectors
import javax.swing.*
import javax.swing.plaf.ButtonUI

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(private val project: Project) : UpdatableChat {
  private val allContentLayout = CardLayout()
  private val allContentPanel = JPanel(allContentLayout)
  private val tabbedPane = JBTabbedPane()
  private val messagesPanel = JPanel()
  private val promptPanel: PromptPanel
  private val sendButton: JButton
  private var inProgressChat = CancellationToken()
  private val stopGeneratingButton =
      JButton("Stop generating", IconUtil.desaturate(AllIcons.Actions.Suspend))
  private val recipesPanel: JBPanelWithEmptyText
  val embeddingStatusView: EmbeddingStatusView
  override var isChatVisible = false
  private var codyOnboardingGuidancePanel: CodyOnboardingGuidancePanel? = null
  private val chatMessageHistory = CodyChatMessageHistory(CHAT_MESSAGE_HISTORY_CAPACITY)

  init {
    // Tabs
    val contentPanel = JPanel()
    tabbedPane.insertTab("Chat", null, contentPanel, null, CHAT_TAB_INDEX)
    recipesPanel = JBPanelWithEmptyText(GridLayout(0, 1))
    recipesPanel.layout = BoxLayout(recipesPanel, BoxLayout.Y_AXIS)
    tabbedPane.insertTab("Commands", null, recipesPanel, null, RECIPES_TAB_INDEX)

    // Initiate filling recipes panel in the background
    refreshRecipes()

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
    stopGeneratingButtonPanel.preferredSize =
        Dimension(Short.MAX_VALUE.toInt(), stopGeneratingButton.getPreferredSize().height + 10)
    stopGeneratingButton.addActionListener {
      inProgressChat.abort()
      stopGeneratingButton.isVisible = false
    }
    stopGeneratingButton.isVisible = false
    stopGeneratingButtonPanel.add(stopGeneratingButton)
    stopGeneratingButtonPanel.isOpaque = false
    embeddingStatusView = EmbeddingStatusView(project)
    val lowerPanel = LowerPanel(stopGeneratingButtonPanel, promptPanel, embeddingStatusView)

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
  }

  @RequiresEdt
  fun refreshRecipes() {
    recipesPanel.removeAll()
    recipesPanel.emptyText.text = "Loading commands..."
    recipesPanel.revalidate()
    recipesPanel.repaint()
    val server = getServer(project)
    if (server == null) {
      setRecipesPanelError()
      return
    }
    ApplicationManager.getApplication().executeOnPooledThread { // Non-blocking data fetch
      try {
        server.recipesList().thenAccept { recipes: List<RecipeInfo> ->
          ApplicationManager.getApplication().invokeLater {
            updateUIWithRecipeList(recipes)
          } // Update on EDT
        }
      } catch (e: Exception) {
        logger.warn("Error fetching commands from agent", e)
        // Update on EDT
        ApplicationManager.getApplication().invokeLater { setRecipesPanelError() }
      }
    }
  }

  @RequiresEdt
  private fun setRecipesPanelError() {
    val emptyText = recipesPanel.emptyText
    emptyText.clear()
    emptyText.appendLine("Error fetching commands. Check your connection.")
    emptyText.appendLine("If the problem persists, please contact support.")
    emptyText.appendLine(
        "Retry",
        SimpleTextAttributes(
            SimpleTextAttributes.STYLE_PLAIN, JBUI.CurrentTheme.Link.Foreground.ENABLED)) {
          refreshRecipes()
        }
  }

  @RequiresEdt
  private fun updateUIWithRecipeList(recipes: List<RecipeInfo>) {
    // we don't want to display recipes with ID "chat-question" and "code-question"
    val excludedRecipeIds: List<String?> =
        listOf("chat-question", "code-question", "translate-to-language")
    val recipesToDisplay =
        recipes
            .stream()
            .filter { recipe: RecipeInfo -> !excludedRecipeIds.contains(recipe.id) }
            .collect(Collectors.toList())
    fillRecipesPanel(recipesToDisplay)
    fillContextMenu(recipesToDisplay)
  }

  @RequiresEdt
  private fun fillRecipesPanel(recipes: List<RecipeInfo>) {
    recipesPanel.removeAll()

    // Loop on recipes and add a button for each item
    for (recipe in recipes) {
      val recipeButton = createRecipeButton(recipe.title)
      recipeButton.addActionListener {
        GraphQlLogger.logCodyEvent(project, "recipe:" + recipe.id, "clicked")
        val editorManager = FileEditorManager.getInstance(project)
        CodyEditorFactoryListener.Util.informAgentAboutEditorChange(
            editorManager.selectedTextEditor)
        sendMessage(project, recipe.title, recipe.id)
      }
      recipesPanel.add(recipeButton)
    }
  }

  private fun fillContextMenu(recipes: List<RecipeInfo>) {
    val actionManager = ActionManager.getInstance()
    val group = actionManager.getAction("CodyEditorActions") as DefaultActionGroup

    // Loop on recipes and create an action for each new item
    for (recipe in recipes) {
      val actionId = "cody.recipe." + recipe.id
      val existingAction = actionManager.getAction(actionId)
      if (existingAction != null) {
        continue
      }
      val action: DumbAwareAction =
          object : DumbAwareAction(recipe.title) {
            override fun actionPerformed(e: AnActionEvent) {
              GraphQlLogger.logCodyEvent(project, "recipe:" + recipe.id, "clicked")
              sendMessage(project, recipe.title, recipe.id)
            }
          }
      actionManager.registerAction(actionId, action)
      group.addAction(action)
    }
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
        refreshRecipes()
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

  private fun createRecipeButton(text: String): JButton {
    val button = JButton(text)
    button.alignmentX = Component.CENTER_ALIGNMENT
    button.maximumSize = Dimension(Int.MAX_VALUE, button.getPreferredSize().height)
    val buttonUI = DarculaButtonUI.createUI(button) as ButtonUI
    button.setUI(buttonUI)
    return button
  }

  private fun addWelcomeMessage() {
    val welcomeText =
        "Hello! I'm Cody. I can write code and answer questions for you. See [Cody documentation](https://docs.sourcegraph.com/cody) for help and tips."
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
    }
  }

  override fun finishMessageProcessing() {
    ApplicationManager.getApplication().invokeLater {
      stopGeneratingButton.isVisible = false
      ensureBlinkingCursorIsNotDisplayed()
      sendButton.isEnabled = promptPanel.textArea.text.isNotBlank()
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
      getInitializedServer(project).thenAccept { it?.transcriptReset() }
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
    sendMessage(project, text, "chat-question")
    promptPanel.reset()
  }

  @RequiresEdt
  private fun sendMessage(project: Project, message: String, recipeId: String) {
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
      tryRestartingAgentIfNotRunning(project)
      if (isConnected(project)) {
        try {
          chat.sendMessageViaAgent(
              getClient(project),
              getInitializedServer(project),
              humanMessage,
              recipeId,
              this,
              inProgressChat)
        } catch (e: Exception) {
          logger.warn("Error sending message '$humanMessage' to chat", e)
        }
      } else {
        logger.warn("Agent is disabled, can't use chat.")
        addMessageToChat(
            ChatMessage(
                Speaker.ASSISTANT,
                "Cody is not able to reply at the moment. " +
                    "This is a bug, please report an issue to https://github.com/sourcegraph/sourcegraph/issues/new?template=jetbrains.md " +
                    "and include as many details as possible to help troubleshoot the problem."))
        finishMessageProcessing()
      }
      GraphQlLogger.logCodyEvent(this.project, "recipe:chat-question", "executed")
    }
  }

  override fun displayUsedContext(contextMessages: List<ContextMessage?>) {
    if (contextMessages.isEmpty()) {
      // Do nothing when there are no context files. It's normal that some answers have no context
      // files.
      return
    }
    val contextFilesMessage = ContextFilesMessage(contextMessages)
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

  val preferredFocusableComponent: JComponent
    get() = promptPanel.textArea

  companion object {
    const val ONBOARDING_PANEL = "onboardingPanel"
    const val CHAT_PANEL_INDEX = 0
    const val SIGN_IN_PANEL_INDEX = 1
    const val ONBOARDING_PANEL_INDEX = 2
    var logger = Logger.getInstance(CodyToolWindowContent::class.java)
    const val SING_IN_WITH_SOURCEGRAPH_PANEL = "singInWithSourcegraphPanel"
    private const val CHAT_TAB_INDEX = 0
    private const val RECIPES_TAB_INDEX = 1
    private const val CHAT_MESSAGE_HISTORY_CAPACITY = 100

    fun getInstance(project: Project): CodyToolWindowContent {
      return project.getService(CodyToolWindowContent::class.java)
    }
  }
}
