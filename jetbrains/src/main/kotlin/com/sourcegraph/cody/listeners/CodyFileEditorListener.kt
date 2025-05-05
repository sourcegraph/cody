package com.sourcegraph.cody.listeners

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService.Companion.withAgent
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol_generated.TextDocument_DidFocusParams
import com.sourcegraph.utils.CodyEditorUtil
import com.sourcegraph.utils.ThreadingUtil

class CodyFileEditorListener : FileEditorManagerListener {
  private val logger = Logger.getInstance(CodyFileEditorListener::class.java)

  override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
    try {
      val textEditor = source.getSelectedEditor(file) as? TextEditor ?: return
      val editor = textEditor.editor
      val protocolTextFile = ProtocolTextDocumentExt.fromVirtualEditorFile(editor, file) ?: return
      EditorChangesBus.documentChanged(editor.project, protocolTextFile)

      withAgent(source.project) { agent: CodyAgent ->
        agent.server.textDocument_didOpen(protocolTextFile)
      }
    } catch (x: Exception) {
      logger.warn("Error in fileOpened method for file: ${file.path}", x)
    }
  }

  override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
    try {
      val protocolTextFile = ProtocolTextDocumentExt.fromVirtualFile(file) ?: return
      EditorChangesBus.documentChanged(source.project, protocolTextFile)
      withAgent(source.project) { agent: CodyAgent ->
        agent.server.textDocument_didClose(protocolTextFile)
      }
    } catch (x: Exception) {
      logger.warn("Error in fileClosed method for file: ${file.path}", x)
    }
  }

  companion object {
    private val logger = Logger.getInstance(CodyFileEditorListener::class.java)

    private fun processDocuments(
        project: Project,
        getEditors: (Project) -> Set<Editor>,
        processDocument: (ProtocolTextDocument) -> Unit
    ) {
      val documents =
          ThreadingUtil.runInEdtAndGet {
            if (project.isDisposed) return@runInEdtAndGet emptySet()

            getEditors(project).mapNotNull { editor ->
              FileDocumentManager.getInstance().getFile(editor.document)?.let { file ->
                try {
                  ProtocolTextDocumentExt.fromVirtualEditorFile(editor, file)
                } catch (x: Exception) {
                  logger.warn("Error while obtaining text document for file: ${file.path}", x)
                  null
                }
              }
            }
          }

      documents.forEach(processDocument)
    }

    // When IDEA starts for the first time, we send duplicate `textDocument/didOpen` notifications
    // with `fileOpened` above. This function is only needed when we restart the agent process.
    fun registerAllOpenedFiles(project: Project, codyAgent: CodyAgent) {
      processDocuments(
          project,
          CodyEditorUtil::getAllOpenEditors,
      ) { textDocument ->
        codyAgent.server.textDocument_didOpen(textDocument)
      }

      processDocuments(
          project,
          CodyEditorUtil::getSelectedEditors,
      ) { textDocument ->
        codyAgent.server.textDocument_didFocus(TextDocument_DidFocusParams(textDocument.uri))
      }
    }
  }
}
