package com.sourcegraph.cody.listeners

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
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
  private val logger = Logger.getInstance(CodyFileEditorListener::class.java)

  override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
    try {
      source.selectedTextEditor?.let { editor ->
        val protocolTextFile = fromVirtualFile(editor, file)
        withAgent(source.project) { agent: CodyAgent ->
          agent.server.textDocumentDidOpen(protocolTextFile)
        }
      }
    } catch (x: Exception) {
      logger.warn("Error in fileOpened method for file: ${file.path}", x)
    }
  }

  override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
    try {
      source.selectedTextEditor?.let { editor ->
        val protocolTextFile = fromVirtualFile(editor, file)
        withAgent(source.project) { agent: CodyAgent ->
          agent.server.textDocumentDidClose(protocolTextFile)
        }
      }
    } catch (x: Exception) {
      logger.warn("Error in fileClosed method for file: ${file.path}", x)
    }
  }

  companion object {
    private val logger = Logger.getInstance(CodyFileEditorListener::class.java)

    fun registerAllOpenedFiles(project: Project, codyAgent: CodyAgent) {

      ApplicationManager.getApplication().invokeLater {
        val fileDocumentManager = FileDocumentManager.getInstance()

        EditorFactory.getInstance().allEditors.forEach { editor ->
          fileDocumentManager.getFile(editor.document)?.let { file ->
            try {
              val textDocument = fromVirtualFile(editor, file)
              codyAgent.server.textDocumentDidOpen(textDocument)
            } catch (x: Exception) {
              logger.warn("Error calling textDocument/didOpen for file: ${file.path}", x)
            }
          }
        }

        if (project.isDisposed) return@invokeLater
        FileEditorManager.getInstance(project).selectedTextEditor?.let { editor ->
          val file = fileDocumentManager.getFile(editor.document)
          try {
            val textDocument = fromVirtualFile(editor, file!!)
            codyAgent.server.textDocumentDidFocus(textDocument)
          } catch (x: Exception) {
            logger.warn("Error calling textDocument/didFocus on ${file?.path}", x)
          }
        }
      }
    }
  }
}
