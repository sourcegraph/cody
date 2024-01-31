package com.sourcegraph.cody

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.chat.AgentChatSession
import com.sourcegraph.cody.chat.SignInWithSourcegraphPanel
import com.sourcegraph.cody.chat.ui.CodyOnboardingGuidancePanel
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.commands.ui.CommandsTabPanel
import com.sourcegraph.cody.config.CodyAccount
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import java.awt.CardLayout
import java.awt.Component
import java.util.function.Consumer
import javax.swing.JPanel
import javax.swing.border.Border

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(private val project: Project) {
  private val allContentLayout = CardLayout()
  val allContentPanel = JPanel(allContentLayout)

  private var codyOnboardingGuidancePanel: CodyOnboardingGuidancePanel? = null
  private val signInWithSourcegraphPanel = SignInWithSourcegraphPanel(project)
  private val historyTree = JPanel()
  private val tabbedPane = JBTabbedPane()

  private val chatContainerPanel =
      object : JPanel(CardLayout()) {
        override fun setBorder(border: Border?) {
          // Do not allow parent to add any borders for this component
        }
      }

  private val commandsPanel =
      CommandsTabPanel(project) { commandId: CommandId ->
        addChatSession(AgentChatSession.createFromCommand(project, commandId))
      }

  private val subscriptionPanel = SubscriptionTabPanel()

  init {
    CodyAgentService.getInstance(project).onStartup { agent ->
      agent.client.onNewMessage = Consumer { params ->
        AgentChatSession.getSession(params.id)?.receiveMessage(params.message)
      }

      AgentChatSession.restoreAllSessions(agent)

      ApplicationManager.getApplication().invokeLater { refreshPanelsVisibility() }
    }

    tabbedPane.insertSimpleTab("Chat", chatContainerPanel, CHAT_TAB_INDEX)
    tabbedPane.insertSimpleTab("Chat History", historyTree, HISTORY_TAB_INDEX)
    tabbedPane.insertSimpleTab("Commands", commandsPanel, COMMANDS_TAB_INDEX)
    tabbedPane.insertSimpleTab("Subscription", subscriptionPanel, SUBSCRIPTION_TAB_INDEX)

    allContentPanel.add(tabbedPane, MAIN_PANEL, CHAT_PANEL_INDEX)
    allContentPanel.add(signInWithSourcegraphPanel, SIGN_IN_PANEL, SIGN_IN_PANEL_INDEX)
    allContentLayout.show(allContentPanel, SIGN_IN_PANEL)

    refreshPanelsVisibility()
    refreshSubscriptionTab()
    addChatSession(AgentChatSession.createNew(project))
  }

  fun removeAllChatSessions() {
    AgentChatSession.removeAllSessions()
    addChatSession(AgentChatSession.createNew(project))
  }

  fun addChatSession(chatSession: AgentChatSession) {
    ApplicationManager.getApplication().invokeLater {
      chatContainerPanel.removeAll()
      chatContainerPanel.add(chatSession.getPanel())
      tabbedPane.selectedIndex = CHAT_TAB_INDEX
    }
  }

  fun refreshSubscriptionTab() {
    CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
      fetchSubscriptionPanelData(project, agent.server).thenApply { data ->
        if (data != null) {
          ApplicationManager.getApplication().invokeLater {
            val isSubscriptionTabPresent = tabbedPane.tabCount > SUBSCRIPTION_TAB_INDEX
            if (data.isDotcomAccount && data.codyProFeatureFlag) {
              if (!isSubscriptionTabPresent) {
                tabbedPane.insertSimpleTab(
                    "Subscription", subscriptionPanel, SUBSCRIPTION_TAB_INDEX)
              }
              subscriptionPanel.update(data.isCurrentUserPro)
            } else if (isSubscriptionTabPresent) {
              tabbedPane.remove(SUBSCRIPTION_TAB_INDEX)
            }
          }
        }
      }
    }
  }

  @RequiresEdt
  fun refreshPanelsVisibility() {
    val codyAuthenticationManager = CodyAuthenticationManager.instance
    if (codyAuthenticationManager.getAccounts().isEmpty()) {
      allContentLayout.show(allContentPanel, SIGN_IN_PANEL)
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
      return
    }
    allContentLayout.show(allContentPanel, MAIN_PANEL)
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
    private const val SUBSCRIPTION_TAB_INDEX = 3

    var logger = Logger.getInstance(CodyToolWindowContent::class.java)

    fun executeOnInstanceIfNotDisposed(
        project: Project,
        myAction: CodyToolWindowContent.() -> Unit
    ) {
      if (!project.isDisposed) {
        val codyToolWindowContent = project.getService(CodyToolWindowContent::class.java)
        codyToolWindowContent.myAction()
      }
    }

    private fun JBTabbedPane.insertSimpleTab(title: String, component: Component, index: Int) =
        insertTab(title, /* icon = */ null, component, /* tip = */ null, index)
  }
}
