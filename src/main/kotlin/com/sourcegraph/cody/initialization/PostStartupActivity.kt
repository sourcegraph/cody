package com.sourcegraph.cody.initialization

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.ex.EditorEventMulticasterEx
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.auth.SelectOneOfTheAccountsAsActive
import com.sourcegraph.cody.config.SettingsMigration
import com.sourcegraph.cody.config.ui.CheckUpdatesTask
import com.sourcegraph.cody.listeners.CodyCaretListener
import com.sourcegraph.cody.listeners.CodyDocumentListener
import com.sourcegraph.cody.listeners.CodyFocusChangeListener
import com.sourcegraph.cody.listeners.CodySelectionListener
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

  // TODO(olafurpg): this activity is taking ~2.5s to run during tests, which indicates that we're
  // doing something wrong, which may be slowing down agent startup. Not fixing it now but this
  // deserves more investigation.
  override fun runActivity(project: Project) {
    TelemetryInitializerActivity().runActivity(project)

    SettingsMigration().runActivity(project)
    SelectOneOfTheAccountsAsActive().runActivity(project)
    CodyAuthNotificationActivity().runActivity(project)
    ApplicationManager.getApplication().executeOnPooledThread {
      // Scheduling because this task takes ~2s to run
      CheckUpdatesTask(project).queue()
    }
    if (ConfigUtil.isCodyEnabled()) CodyAgentService.getInstance(project).startAgent(project)
    CodyStatusService.resetApplication(project)
    EndOfTrialNotificationScheduler.createAndStart(project)

    val multicaster = EditorFactory.getInstance().eventMulticaster as EditorEventMulticasterEx
    val disposable = CodyAgentService.getInstance(project)
    multicaster.addFocusChangeListener(CodyFocusChangeListener(project), disposable)
    multicaster.addCaretListener(CodyCaretListener(project), disposable)
    multicaster.addSelectionListener(CodySelectionListener(project), disposable)
    multicaster.addDocumentListener(CodyDocumentListener(project), disposable)
  }
}
