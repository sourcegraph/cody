package com.sourcegraph.cody.agent

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.config.CodyProjectSettings
import com.sourcegraph.common.ProjectFileUtils
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.vcs.RepoUtil

@Service(Service.Level.PROJECT)
class CodyAgentCodebase(val project: Project) {

  fun initializeRepoName() {
    ApplicationManager.getApplication().executeOnPooledThread {
      onRepositoryNameChange(RepoUtil.findRepositoryName(project, null))
    }
  }

  // TODO: Support list of repository names instead of just one.
  private val application = ApplicationManager.getApplication()
  private val settings = CodyProjectSettings.getInstance(project)
  private var inferredUrl: String? = null

  fun setUrl(url: String) {
    settings.remoteUrl = url
    onPropagateConfiguration()
  }

  fun getUrl(): String? = settings.remoteUrl ?: inferredUrl

  fun onFileOpened(project: Project, file: VirtualFile) {
    application.executeOnPooledThread {
      onRepositoryNameChange(RepoUtil.findRepositoryName(project, file))
      application.runReadAction {
        val openedFileName = file.name
        val relativeFilePath: String? = ProjectFileUtils.getRelativePathToProjectRoot(project, file)
        ApplicationManager.getApplication().invokeLater {
          CodyToolWindowContent.getInstance(project)
              .embeddingStatusView
              .setOpenedFileName(openedFileName, relativeFilePath)
        }
      }
    }
  }

  private fun onPropagateConfiguration() {
    CodyToolWindowContent.getInstance(project).embeddingStatusView.updateEmbeddingStatus()
    CodyAgentService.applyAgentOnBackgroundThread(project) {
      it.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
    }
  }

  private fun onRepositoryNameChange(repositoryName: String?) {
    if (repositoryName != null && inferredUrl != repositoryName) {
      inferredUrl = repositoryName
      onPropagateConfiguration()
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): CodyAgentCodebase {
      return project.service<CodyAgentCodebase>()
    }
  }
}
