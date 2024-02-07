package com.sourcegraph.cody.context.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.CommandExecuteParams
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.util.concurrent.atomic.AtomicBoolean

class ReindexButton(private val project: Project) :
    ContextToolbarButton(
        CodyBundle.getString("context-panel.button.reindex"), AllIcons.Actions.Refresh) {
  override fun actionPerformed(p0: AnActionEvent) {
    CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
      ProgressManager.getInstance()
          .run(
              object :
                  Task.Backgroundable(
                      project, CodyBundle.getString("context-panel.in-progress"), false) {
                override fun run(indicator: ProgressIndicator) {
                  try {
                    isReindexingInProgress.set(true)
                    val cmd = CommandExecuteParams("cody.search.index-update", emptyList())
                    agent.server.commandExecute(cmd).get()
                  } catch (e: Exception) {
                    val errMsg = e.message ?: e.toString()
                    Messages.showErrorDialog(
                        CodyBundle.getString("context-panel.error-message").fmt(errMsg),
                        CodyBundle.getString("context-panel.error-title"))
                  } finally {
                    indicator.stop()
                    isReindexingInProgress.set(false)
                  }
                }
              })
    }
  }

  override fun isEnabled(): Boolean = !isReindexingInProgress.get()

  private val isReindexingInProgress = AtomicBoolean(false)
}
