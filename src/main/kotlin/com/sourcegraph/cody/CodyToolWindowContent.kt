package com.sourcegraph.cody

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.TabbedPaneWrapper
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.UIUtil
import com.jetbrains.rd.util.AtomicReference
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.chat.AgentChatSession
import com.sourcegraph.cody.chat.AgentChatSessionService
import com.sourcegraph.cody.chat.SignInWithSourcegraphPanel
import com.sourcegraph.cody.chat.ui.CodyOnboardingGuidancePanel
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.commands.ui.CommandsTabPanel
import com.sourcegraph.cody.config.CodyAccount
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.history.ChatHistoryPanel
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.ChatState
import java.awt.CardLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.border.Border

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(private val project: Project) {
  private val allContentLayout = CardLayout()
  val allContentPanel = JPanel(allContentLayout)

  private var codyOnboardingGuidancePanel: CodyOnboardingGuidancePanel? = null
  private val signInWithSourcegraphPanel = SignInWithSourcegraphPanel(project)
  private val chatHistoryPanel =
      ChatHistoryPanel(project, ::selectChat, ::removeChat, ::removeAllChats)
  private val tabbedPane = TabbedPaneWrapper(CodyAgentService.getInstance(project))
  private val currentChatSession: AtomicReference<AgentChatSession?> = AtomicReference(null)

  private val chatContainerPanel =
      object : JPanel(CardLayout()) {
        override fun setBorder(border: Border?) {
          // Do not allow parent to add any borders for this component
        }
      }

  private val commandsPanel =
      CommandsTabPanel(project) { commandId: CommandId ->
        executeOnInstanceIfNotDisposed(project) {
          switchToChatSession(AgentChatSession.createFromCommand(project, commandId))
        }
      }

  private val myAccountPanel = MyAccountTabPanel(project)

  init {
    tabbedPane.insertSimpleTab("Chat", chatContainerPanel, CHAT_TAB_INDEX)
    tabbedPane.insertSimpleTab("Chat History", chatHistoryPanel, HISTORY_TAB_INDEX)
    tabbedPane.insertSimpleTab("Commands", commandsPanel, COMMANDS_TAB_INDEX)

    allContentPanel.add(tabbedPane.component, MAIN_PANEL, CHAT_PANEL_INDEX)
    allContentPanel.add(signInWithSourcegraphPanel, SIGN_IN_PANEL, SIGN_IN_PANEL_INDEX)
    allContentLayout.show(allContentPanel, SIGN_IN_PANEL)

    refreshPanelsVisibility()
    refreshMyAccountTab()
    switchToChatSession(AgentChatSession.createNew(project))
  }

  fun removeAllChatSessions() {
    AgentChatSessionService.getInstance(project).removeAllSessions()
    switchToChatSession(AgentChatSession.createNew(project))
  }

  fun switchToChatSession(chatSession: AgentChatSession, showChatWindow: Boolean = true) {
    UIUtil.invokeLaterIfNeeded {
      currentChatSession.getAndSet(chatSession)
      currentChatSession.get()?.getPanel()?.setAsActive()
      chatContainerPanel.removeAll()
      chatContainerPanel.add(chatSession.getPanel())
      if (showChatWindow) tabbedPane.selectedIndex = CHAT_TAB_INDEX
    }
  }

  fun focusOnChat() {
    tabbedPane.selectedIndex = CHAT_TAB_INDEX
    currentChatSession.get()?.getPanel()?.setAsActive()
  }

  fun refreshMyAccountTab() {
    val isMyAccountTabVisible = tabbedPane.tabCount > MY_ACCOUNT_TAB_INDEX
    if (CodyAuthenticationManager.getInstance(project).getActiveAccount()?.isDotcomAccount() ==
        true) {
      if (!isMyAccountTabVisible) {
        tabbedPane.insertSimpleTab("My Account", myAccountPanel, MY_ACCOUNT_TAB_INDEX)
      }
      myAccountPanel.update()
    } else if (isMyAccountTabVisible) {
      tabbedPane.removeTabAt(MY_ACCOUNT_TAB_INDEX)
    }
  }

  @RequiresEdt fun refreshChatHistoryPanel() = chatHistoryPanel.rebuildTree()

  @RequiresEdt
  fun refreshPanelsVisibility() {
    val codyAuthenticationManager = CodyAuthenticationManager.getInstance(project)
    if (codyAuthenticationManager.getAccounts().isEmpty()) {
      allContentLayout.show(allContentPanel, SIGN_IN_PANEL)
      return
    }
    val activeAccount = codyAuthenticationManager.getActiveAccount()
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
      return
    }
    allContentLayout.show(allContentPanel, MAIN_PANEL)
  }

  @RequiresEdt
  private fun selectChat(state: ChatState) {
    val session = AgentChatSessionService.getInstance(project).getOrCreateFromState(state)
    switchToChatSession(session)
  }

  private fun removeChat(state: ChatState) {
    HistoryService.getInstance(project).remove(state.internalId)
    if (AgentChatSessionService.getInstance(project).removeSession(state)) {
      val isVisible = currentChatSession.get()?.getInternalId() == state.internalId
      if (isVisible) {
        switchToChatSession(AgentChatSession.createNew(project), showChatWindow = false)
      }
    }
  }

  private fun removeAllChats() {
    AgentChatSessionService.getInstance(project).removeAllSessions()
    HistoryService.getInstance(project).removeAll()
    switchToChatSession(AgentChatSession.createNew(project))
  }

  companion object {
    const val ONBOARDING_PANEL = "onboardingPanel"
    const val SIGN_IN_PANEL = "singInWithSourcegraphPanel"
    const val MAIN_PANEL = "mainPanel"

    const val CHAT_PANEL_INDEX = 0
    const val SIGN_IN_PANEL_INDEX = 1
    const val ONBOARDING_PANEL_INDEX = 2

    private const val CHAT_TAB_INDEX = 0
    private const val HISTORY_TAB_INDEX = 1
    private const val COMMANDS_TAB_INDEX = 2
    private const val MY_ACCOUNT_TAB_INDEX = 3

    var logger = Logger.getInstance(CodyToolWindowContent::class.java)

    fun executeOnInstanceIfNotDisposed(
        project: Project,
        myAction: CodyToolWindowContent.() -> Unit
    ) {
      UIUtil.invokeLaterIfNeeded {
        if (!project.isDisposed) {
          val codyToolWindowContent = project.getService(CodyToolWindowContent::class.java)
          codyToolWindowContent.myAction()
        }
      }
    }

    private fun TabbedPaneWrapper.insertSimpleTab(
        title: String,
        component: JComponent,
        index: Int
    ) = insertTab(title, /* icon = */ null, component, /* tip = */ null, index)
  }
}
