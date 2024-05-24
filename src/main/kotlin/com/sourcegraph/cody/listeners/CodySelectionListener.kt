package com.sourcegraph.cody.listeners

import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.config.ConfigUtil

class CodySelectionListener(val project: Project) : SelectionListener {

  override fun selectionChanged(event: SelectionEvent) {
    if (!ConfigUtil.isCodyEnabled() || event.editor == null) {
      return
    }

    ProtocolTextDocument.fromEditorWithRangeSelection(event.editor, event)?.let { textDocument ->
      EditorChangesBus.documentChanged(project, textDocument)
      CodyAgentService.withAgent(project) { agent ->
        agent.server.textDocumentDidChange(textDocument)
      }
    }

    CodyAutocompleteManager.instance.clearAutocompleteSuggestions(event.editor)
  }
}
