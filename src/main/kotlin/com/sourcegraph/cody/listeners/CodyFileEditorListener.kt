package com.sourcegraph.cody.listeners

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService.Companion.withAgent
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument.Companion.fromVirtualFile

class CodyFileEditorListener : FileEditorManagerListener {
  override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
    source.selectedTextEditor?.let { editor ->
      val protocolTextFile = fromVirtualFile(editor, file)
      withAgent(source.project) { agent: CodyAgent ->
        agent.server.textDocumentDidClose(protocolTextFile)
      }
    }
  }

  override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
    source.selectedTextEditor?.let { editor ->
      val protocolTextFile = fromVirtualFile(editor, file)
      withAgent(source.project) { agent: CodyAgent ->
        agent.server.textDocumentDidClose(protocolTextFile)
      }
    }
  }

  companion object {
    fun registerAllOpenedFiles(project: Project, codyAgent: CodyAgent) {
      ApplicationManager.getApplication().invokeLater {
        val fileDocumentManager = FileDocumentManager.getInstance()
        EditorFactory.getInstance().allEditors.forEach { editor ->
          val file = fileDocumentManager.getFile(editor.document)
          if (file != null) {
            val textDocument = fromVirtualFile(editor, file)
            codyAgent.server.textDocumentDidOpen(textDocument)
          }
        }
        FileEditorManager.getInstance(project).selectedTextEditor?.let { editor ->
          fileDocumentManager.getFile(editor.document)?.let { file ->
            val textDocument = fromVirtualFile(editor, file)
            codyAgent.server.textDocumentDidFocus(textDocument)
          }
        }
      }
    }
  }
}
