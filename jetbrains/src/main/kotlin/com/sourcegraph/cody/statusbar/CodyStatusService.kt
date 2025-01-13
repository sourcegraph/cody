package com.sourcegraph.cody.statusbar

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil

@Service(Service.Level.PROJECT)
class CodyStatusService(val project: Project) : Disposable {

  @Volatile private var status: CodyStatus = CodyStatus.CodyUninit

  fun onCodyAutocompleteStatus(codyStatus: CodyStatus) {
    val notify =
        synchronized(this) {
          val oldStatus = status
          status = codyStatus
          return@synchronized oldStatus != codyStatus
        }
    if (notify) {
      updateCodyStatusBarIcons()
    }
  }

  fun onCodyAutocompleteStatusReset() {
    ApplicationManager.getApplication().executeOnPooledThread {
      if (!project.isDisposed) {
        val notify = didStatusChange(project)
        if (notify) {
          updateCodyStatusBarIcons()
        }
      }
    }
  }

  private fun didStatusChange(project: Project): Boolean {
    synchronized(this) {
      val oldStatus = status

      // Note, the order of these clauses is important because earlier clauses take precedence over
      // later ones.
      // Fundamental issues are tested first.
      status =
          if (!ConfigUtil.isCodyEnabled()) {
            CodyStatus.CodyDisabled
          } else if (CodyAgentService.agentError.get() != null) {
            CodyStatus.AgentError
          } else if (!CodyAgentService.isConnected(project)) {
            CodyStatus.CodyAgentNotRunning
          } else if (!CodyAuthService.getInstance(project).isActivated()) {
            CodyStatus.CodyNotSignedIn
          } else if (UpgradeToCodyProNotification.autocompleteRateLimitError.get() != null ||
              UpgradeToCodyProNotification.chatRateLimitError.get() != null) {
            CodyStatus.RateLimitError
          } else if (IgnoreOracle.getInstance(project).isEditingIgnoredFile) {
            CodyStatus.InIgnoredFile
          } else if (!ConfigUtil.isCodyAutocompleteEnabled()) {
            CodyStatus.AutocompleteDisabled
          } else {
            CodyStatus.Ready
          }
      return oldStatus != status
    }
  }

  private fun updateCodyStatusBarIcons() {
    UIUtil.invokeLaterIfNeeded {
      val openProjects = ProjectManager.getInstance().openProjects
      openProjects.forEach { project ->
        project.takeIf { !it.isDisposed }?.let { CodyStatusBarWidget.update(it) }
      }
    }
  }

  private fun getStatus(): CodyStatus {
    synchronized(this) {
      return status
    }
  }

  override fun dispose() = Unit

  companion object {

    fun getInstance(project: Project): CodyStatusService {
      return project.service<CodyStatusService>()
    }

    fun getCurrentStatus(project: Project): CodyStatus {
      return getInstance(project).getStatus()
    }

    @JvmStatic
    fun notifyApplication(project: Project, status: CodyStatus) {
      if (!project.isDisposed) {
        getInstance(project).onCodyAutocompleteStatus(status)
      }
    }

    @JvmStatic
    fun resetApplication(project: Project) {
      if (!project.isDisposed) {
        getInstance(project).onCodyAutocompleteStatusReset()
      }
    }
  }
}
