package com.sourcegraph.cody

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.chat.SignInWithSourcegraphPanel
import com.sourcegraph.cody.chat.ui.CodyOnboardingGuidancePanel
import com.sourcegraph.cody.config.CodyAccount
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.ui.web.WebUIService
import java.awt.CardLayout
import javax.swing.JPanel

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(project: Project) {
  private val allContentLayout = CardLayout()
  val allContentPanel = JPanel(allContentLayout)

  init {
    allContentPanel.add(SignInWithSourcegraphPanel(project), SIGN_IN_PANEL, SIGN_IN_PANEL_INDEX)
    val codyOnboardingGuidancePanel = CodyOnboardingGuidancePanel(project)
    codyOnboardingGuidancePanel.addMainButtonActionListener {
      CodyApplicationSettings.instance.isOnboardingGuidanceDismissed = true
      refreshPanelsVisibility()
    }
    allContentPanel.add(codyOnboardingGuidancePanel, ONBOARDING_PANEL, ONBOARDING_PANEL_INDEX)

    WebUIService.getInstance(project).views.provideCodyToolWindowContent(this)

    allContentLayout.show(allContentPanel, MAIN_PANEL)

    refreshPanelsVisibility()
  }

  @RequiresEdt
  fun refreshPanelsVisibility() {
    val codyAuthenticationManager = CodyAuthenticationManager.getInstance()
    if (codyAuthenticationManager.hasNoActiveAccount() ||
        codyAuthenticationManager.showInvalidAccessTokenError()) {
      allContentLayout.show(allContentPanel, SIGN_IN_PANEL)
      return
    }
    val activeAccount = codyAuthenticationManager.account
    if (!CodyApplicationSettings.instance.isOnboardingGuidanceDismissed) {
      val displayName = activeAccount?.let(CodyAccount::displayName)
      allContentPanel.getComponent(ONBOARDING_PANEL_INDEX)?.let {
        (it as CodyOnboardingGuidancePanel).updateDisplayName(displayName)
      }
      allContentLayout.show(allContentPanel, ONBOARDING_PANEL)
      return
    }
    allContentLayout.show(allContentPanel, MAIN_PANEL)
  }

  companion object {
    const val ONBOARDING_PANEL = "onboardingPanel"
    const val SIGN_IN_PANEL = "signInWithSourcegraphPanel"
    const val MAIN_PANEL = "mainPanel"

    const val SIGN_IN_PANEL_INDEX = 0
    const val ONBOARDING_PANEL_INDEX = 1
    const val MAIN_PANEL_INDEX = 2

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
