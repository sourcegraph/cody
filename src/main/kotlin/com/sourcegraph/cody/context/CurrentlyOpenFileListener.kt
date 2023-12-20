package com.sourcegraph.cody.context

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.sourcegraph.common.ProjectFileUtils

class CurrentlyOpenFileListener(
    private val project: Project,
    private val embeddingStatusView: EmbeddingStatusView
) : FileEditorManagerListener {
  override fun selectionChanged(event: FileEditorManagerEvent) {
    ApplicationManager.getApplication().runReadAction {
      val newFile = event.newFile
      val openedFileName = newFile?.name ?: ""
      var relativeFilePath: String? = null

      if (newFile != null) {
        relativeFilePath = ProjectFileUtils.getRelativePathToProjectRoot(project, newFile)
      }
      embeddingStatusView.setOpenedFileName(openedFileName, relativeFilePath)
    }
  }
}
