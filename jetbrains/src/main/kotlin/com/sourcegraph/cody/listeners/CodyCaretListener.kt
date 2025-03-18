package com.sourcegraph.cody.listeners

import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.editor.EditorKind
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.CaretListener
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil

class CodyCaretListener(val project: Project) : CaretListener {
  override fun caretPositionChanged(e: CaretEvent) {
    if (!ConfigUtil.isCodyEnabled() ||
        e.editor.project != project ||
        !e.editor.document.isWritable ||
        (e.editor.editorKind != EditorKind.MAIN_EDITOR &&
            !ConfigUtil.isIntegrationTestModeEnabled())) {
      return
    }

    val commandName = CommandProcessor.getInstance().currentCommandName
    if (commandName == CodyEditorUtil.VIM_EXIT_INSERT_MODE_ACTION) {
      return
    }

    ProtocolTextDocumentExt.fromEditorWithOffsetSelection(e.editor, e)?.let { textDocument ->
      EditorChangesBus.documentChanged(project, textDocument)
      CodyAgentService.withAgent(project) { agent: CodyAgent ->
        agent.server.textDocument_didChange(textDocument)
      }
    }

    CodyAutocompleteManager.instance.clearAutocompleteSuggestions(e.editor)
    CodyAutocompleteManager.instance.triggerAutocomplete(
        e.editor, e.editor.caretModel.offset, InlineCompletionTriggerKind.AUTOMATIC)
  }
}
