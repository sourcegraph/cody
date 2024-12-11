package com.sourcegraph.cody.editor

import com.intellij.openapi.command.CommandEvent
import com.intellij.openapi.command.CommandListener
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.utils.CodyEditorUtil
import com.sourcegraph.utils.CodyEditorUtil.VIM_EXIT_INSERT_MODE_ACTION

class CodyCommandListener(val project: Project) : CommandListener {
  override fun commandFinished(event: CommandEvent) {
    if (event.commandName.isNullOrBlank() ||
        event.commandName.equals(VIM_EXIT_INSERT_MODE_ACTION)) {
      CodyEditorUtil.getSelectedEditors(project).forEach { editor ->
        CodyAutocompleteManager.instance.disposeInlays(editor)
      }
    }
  }
}
