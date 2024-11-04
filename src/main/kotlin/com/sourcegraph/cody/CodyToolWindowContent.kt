package com.sourcegraph.cody

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.chat.SignInWithSourcegraphPanel
import com.sourcegraph.cody.chat.ui.CodyOnboardingGuidancePanel
import com.sourcegraph.cody.chat.ui.ErrorPanel
import com.sourcegraph.cody.chat.ui.MissingJcefPanel
import com.sourcegraph.cody.config.CodyAccount
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.initialization.VerifyJavaBootRuntimeVersion.Companion.isCurrentRuntimeMissingJcef
import com.sourcegraph.cody.ui.web.CodyToolWindowContentWebviewHost
import com.sourcegraph.cody.ui.web.WebUIService
import java.awt.CardLayout
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.GridLayout
import javax.swing.JComponent
import javax.swing.JPanel

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(val project: Project) {
  private val cardLayout = CardLayout()
  private val cardPanel = JPanel(cardLayout)
  val allContentPanel: JComponent = JPanel(GridLayout(1, 1))
  private var webview: CodyToolWindowContentWebviewHost? = null

  init {
    cardPanel.add(SignInWithSourcegraphPanel(project), SIGN_IN_PANEL, SIGN_IN_PANEL_INDEX)
    val codyOnboardingGuidancePanel = CodyOnboardingGuidancePanel(project)
    codyOnboardingGuidancePanel.addMainButtonActionListener {
      CodyApplicationSettings.instance.isOnboardingGuidanceDismissed = true
      refreshPanelsVisibility()
    }
    cardPanel.add(codyOnboardingGuidancePanel, ONBOARDING_PANEL, ONBOARDING_PANEL_INDEX)

    // Because the webview may be created lazily, populate a placeholder control.
    val spinnerPlaceholder = JPanel(GridBagLayout())
    val spinnerLabel =
        JBLabel("Starting Cody...", Icons.StatusBar.CompletionInProgress, JBLabel.CENTER)
    spinnerPlaceholder.add(spinnerLabel, GridBagConstraints())
    cardPanel.add(spinnerPlaceholder, LOADING_PANEL, LOADING_PANEL_INDEX)
    cardPanel.add(MissingJcefPanel(), CHANGE_RUNTIME_PANEL, CHANGE_RUNTIME_PANEL_INDEX)
    cardPanel.add(ErrorPanel(), ERROR_PANEL, ERROR_INDEX)

    refreshPanelsVisibility()
  }

  @RequiresEdt
  fun showLoginPanel() {
    cardLayout.show(cardPanel, SIGN_IN_PANEL)
    showView(cardPanel)
  }

  @RequiresEdt
  fun refreshPanelsVisibility() {
    val codyAuthenticationManager = CodyAuthenticationManager.getInstance()
    if (codyAuthenticationManager.hasNoActiveAccount() ||
        codyAuthenticationManager.showInvalidAccessTokenError()) {
      showLoginPanel()
      return
    }
    val activeAccount = codyAuthenticationManager.account
    if (!CodyApplicationSettings.instance.isOnboardingGuidanceDismissed) {
      val displayName = activeAccount?.let(CodyAccount::displayName)
      cardPanel.getComponent(ONBOARDING_PANEL_INDEX)?.let {
        (it as CodyOnboardingGuidancePanel).updateDisplayName(displayName)
      }
      cardLayout.show(cardPanel, ONBOARDING_PANEL)
      showView(cardPanel)
      return
    }
    val errorOnProxyCreation = WebUIService.getInstance(project).proxyCreationException.get()
    if (errorOnProxyCreation != null) {
      if (isCurrentRuntimeMissingJcef()) {
        cardLayout.show(cardPanel, CHANGE_RUNTIME_PANEL)
        showView(cardPanel)
      } else {
        cardLayout.show(cardPanel, ERROR_PANEL)
        showView(cardPanel)
        logger.error(errorOnProxyCreation)
      }
      return
    }
    cardLayout.show(cardPanel, LOADING_PANEL)
    showView(webview?.proxy?.component ?: cardPanel)
  }

  // Flips the sidebar view to the specified top level component. We do it this way
  // because JetBrains Remote does not display webviews inside a component using
  // CardLayout.
  private fun showView(component: JComponent) {
    if (allContentPanel.components.isEmpty() || allContentPanel.getComponent(0) != component) {
      allContentPanel.removeAll()
      allContentPanel.add(component)
    }
  }

  /** Sets the webview component to display, if any. */
  @RequiresEdt
  internal fun setWebviewComponent(host: CodyToolWindowContentWebviewHost?) {
    webview = host
    if (host != null && host.proxy?.component == null) {
      logger.warn("expected browser component to be created, but was null")
    }
    refreshPanelsVisibility()
  }

  fun openDevTools() {
    webview?.proxy?.openDevTools()
  }

  companion object {
    const val ONBOARDING_PANEL = "onboardingPanel"
    const val SIGN_IN_PANEL = "signInWithSourcegraphPanel"
    const val LOADING_PANEL = "loadingPanel"
    const val CHANGE_RUNTIME_PANEL = "changeRuntime"
    const val ERROR_PANEL = "error"

    const val SIGN_IN_PANEL_INDEX = 0
    const val ONBOARDING_PANEL_INDEX = 1
    const val LOADING_PANEL_INDEX = 2
    const val CHANGE_RUNTIME_PANEL_INDEX = 3
    const val ERROR_INDEX = 4

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
  }
}
