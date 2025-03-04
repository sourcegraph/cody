package com.sourcegraph.cody.listeners

import com.intellij.openapi.editor.EditorKind
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.config.ConfigUtil

class CodySelectionListener(val project: Project) : SelectionListener {
  private val inlayManager = CodySelectionInlayManager(project)

  override fun selectionChanged(event: SelectionEvent) {
    if (!ConfigUtil.isCodyEnabled() ||
        event.editor == null ||
        event.editor.project != project ||
        !event.editor.document.isWritable ||
        (event.editor.editorKind != EditorKind.MAIN_EDITOR &&
            !ConfigUtil.isIntegrationTestModeEnabled())) {
      return
    }
    val editor = event.editor
    ProtocolTextDocumentExt.fromEditorWithRangeSelection(editor, event)?.let { textDocument ->
      EditorChangesBus.documentChanged(project, textDocument)
      CodyAgentService.withAgent(project) { agent ->
        agent.server.textDocument_didChange(textDocument)
      }
    }

    CodyAutocompleteManager.instance.clearAutocompleteSuggestions(editor)
    inlayManager.handleSelectionChanged(editor, event)
  }
}
