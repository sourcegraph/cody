package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorAction
import com.intellij.openapi.project.DumbAware
import com.sourcegraph.cody.autocomplete.action.CodyAction
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.config.ConfigUtil

open class EditCommandAction(runAction: (Editor, FixupService) -> Unit) :
    EditorAction(EditCommandActionHandler(runAction)), CodyAction, DumbAware {
  override fun update(e: AnActionEvent) {
    super.update(e)

    e.presentation.isVisible =
        ConfigUtil.isFeatureFlagEnabled("cody.feature.inline-edits") ||
            CodyApplicationSettings.instance.isInlineEditionEnabled
  }
}
