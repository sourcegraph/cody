package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorAction
import com.intellij.openapi.project.DumbAware
import com.sourcegraph.cody.autocomplete.action.CodyAction
import com.sourcegraph.cody.edit.FixupService

open class EditCommandAction(runAction: (Editor, FixupService) -> Unit) :
    EditorAction(EditCommandActionHandler(runAction)), CodyAction, DumbAware
