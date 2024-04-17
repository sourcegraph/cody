package com.sourcegraph.cody.listeners

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.FocusChangeListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentCodebase
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument

class CodyFocusChangeListener(val project: Project) : FocusChangeListener {

  override fun focusGained(editor: Editor) {
    val file = FileDocumentManager.getInstance().getFile(editor.document)
    CodyAgentCodebase.getInstance(project).onFileOpened(file)

    ProtocolTextDocument.fromEditor(editor)?.let { textDocument ->
      CodyAgentService.withAgent(project) { agent: CodyAgent ->
        agent.server.textDocumentDidFocus(textDocument)
      }
    }
  }
}
