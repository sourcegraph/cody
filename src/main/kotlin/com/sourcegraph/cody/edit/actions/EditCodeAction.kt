package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.project.DumbAware
import com.sourcegraph.cody.autocomplete.action.CodyAction

class EditCodeAction :
    EditCommandAction({ editor, fixupService -> fixupService.startCodeEdit(editor) }),
    CodyAction,
    DumbAware
