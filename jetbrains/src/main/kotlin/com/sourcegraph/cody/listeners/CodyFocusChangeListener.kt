package com.sourcegraph.cody.listeners

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.FocusChangeListener
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.TextDocument_DidFocusParams
import com.sourcegraph.cody.ignore.IgnoreOracle

class CodyFocusChangeListener(val project: Project) : FocusChangeListener {

  override fun focusGained(editor: Editor) {
    if (editor.project != project) {
      return
    }

    ProtocolTextDocumentExt.fromEditor(editor)?.let { textDocument ->
      EditorChangesBus.documentChanged(project, textDocument)
      CodyAgentService.withServer(project) { server ->
        server.textDocument_didFocus(TextDocument_DidFocusParams(textDocument.uri))
      }
      IgnoreOracle.getInstance(project).focusedFileDidChange(textDocument.uri)
    }
  }
}
