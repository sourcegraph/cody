package com.sourcegraph.cody.agent

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.config.CodyProjectSettings
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.vcs.RepoUtil

@Service(Service.Level.PROJECT)
class CodyAgentCodebase(val project: Project) {

  // TODO: Support list of repository names instead of just one.
  private val application = ApplicationManager.getApplication()
  private val settings = CodyProjectSettings.getInstance(project)
  private var inferredUrl: String? = null

  fun getUrl(): String? = settings.remoteUrl ?: inferredUrl

  fun onFileOpened(project: Project, file: VirtualFile?) {
    application.executeOnPooledThread {
      val repositoryName = RepoUtil.findRepositoryName(project, file)
      if (repositoryName != null && inferredUrl != repositoryName) {
        inferredUrl = repositoryName
        CodyAgentService.applyAgentOnBackgroundThread(project) {
          it.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
        }
      }
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): CodyAgentCodebase {
      return project.service<CodyAgentCodebase>()
    }
  }
}
