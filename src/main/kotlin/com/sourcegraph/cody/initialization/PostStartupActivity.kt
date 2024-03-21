package com.sourcegraph.cody.initialization

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.Constraints
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.sourcegraph.cody.CodyFocusChangeListener
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.auth.SelectOneOfTheAccountsAsActive
import com.sourcegraph.cody.config.SettingsMigration
import com.sourcegraph.cody.config.ui.CheckUpdatesTask
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.config.CodyAuthNotificationActivity
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.telemetry.TelemetryInitializerActivity

/**
 * StartupActivity is obsolete in recent platform versions.
 *
 * TODO: We should migrate to com.intellij.openapi.startup.ProjectActivity when we bump
 *   compatibility.
 */
class PostStartupActivity : StartupActivity.DumbAware {
  override fun runActivity(project: Project) {
    TelemetryInitializerActivity().runActivity(project)
    SettingsMigration().runActivity(project)
    SelectOneOfTheAccountsAsActive().runActivity(project)
    CodyAuthNotificationActivity().runActivity(project)
    CheckUpdatesTask(project).queue()
    if (ConfigUtil.isCodyEnabled()) CodyAgentService.getInstance(project).startAgent(project)
    CodyStatusService.resetApplication(project)
    CodyFocusChangeListener().runActivity(project)
    EndOfTrialNotificationScheduler.createAndStart(project)
    initializeInlineEdits()
  }

  // TODO: This should go away (along with the feature flag) once Inline Edits are stable/released.
  private fun initializeInlineEdits() {
    ApplicationManager.getApplication().invokeLater {
      if (ConfigUtil.isFeatureFlagEnabled("cody.feature.inline-edits")) {
        val actionManager = ActionManager.getInstance()
        (actionManager.getAction("CodyEditorActions") as? DefaultActionGroup)?.apply {
          pushFrontAction(actionManager, "cody.documentCodeAction", this)
          pushFrontAction(actionManager, "cody.editCodeAction", this)
        }
      }
    }
  }

  private fun pushFrontAction(
      actionManager: ActionManager,
      actionId: String,
      group: DefaultActionGroup
  ) {
    actionManager.getAction(actionId)?.let { group.add(it, Constraints.FIRST) }
  }
}
