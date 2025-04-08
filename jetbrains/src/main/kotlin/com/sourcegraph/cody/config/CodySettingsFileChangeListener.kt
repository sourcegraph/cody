package com.sourcegraph.cody.config

import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil

class CodySettingsFileChangeListener(private val project: Project) : FileDocumentManagerListener {
  override fun beforeDocumentSaving(document: Document) {
    val editor = CodyEditorUtil.getEditorForDocument(document) ?: return
    if (editor.project != project) {
      return
    }

    val currentFile = editor.virtualFile
    val configFile =
        LocalFileSystem.getInstance()
            .refreshAndFindFileByNioFile(ConfigUtil.getSettingsFile(project))
    if (currentFile == configFile) {
      // TODO(CODY-5682): Adjust the agent to handle config changes without requiring a restart.
      CodyAgentService.withAgentRestartIfNeeded(project) {
        it.server.extensionConfiguration_change(
            ConfigUtil.getAgentConfiguration(project, customConfigContent = document.text))
      }
    }
  }
}
