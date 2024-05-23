package com.sourcegraph.cody.listeners

import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.config.ConfigUtil

class CodySelectionListener(val project: Project) : SelectionListener {
  override fun selectionChanged(e: SelectionEvent) {
    if (!ConfigUtil.isCodyEnabled() || e.editor == null) {
      return
    }

    ProtocolTextDocument.fromEditorWithRangeSelection(e.editor)?.let { textDocument ->
      CodyAgentService.withAgent(project) { agent ->
        agent.server.textDocumentDidChange(textDocument)
      }
    }

    CodyAutocompleteManager.instance.clearAutocompleteSuggestions(e.editor)
  }
}
