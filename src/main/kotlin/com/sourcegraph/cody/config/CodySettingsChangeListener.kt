package com.sourcegraph.cody.config

import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileDocumentManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.config.ConfigUtil

class CodySettingsChangeListener(private val project: Project) : FileDocumentManagerListener {
  override fun beforeDocumentSaving(document: Document) {
    val currentFile = FileDocumentManager.getInstance().getFile(document)
    val configFile =
        LocalFileSystem.getInstance()
            .refreshAndFindFileByNioFile(ConfigUtil.getSettingsFile(project))
    if (currentFile == configFile) {
      CodyAgentService.getInstance(project).restartAgent(project)
      // TODO: we should instead call `extensionConfiguration_didChange` there:
      // `it.server.extensionConfiguration_didChange(ConfigUtil.getAgentConfiguration(project,
      // document.text))` but it seams that some of the settings changes (like enabling/disabling
      // autocomplete) requires agent restart to take effect.

    }
  }
}
