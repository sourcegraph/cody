package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.project.DumbAware
import com.sourcegraph.cody.autocomplete.action.CodyAction

class TestCodeAction :
    EditCommandAction({ editor, fixupService -> fixupService.startTestCode(editor) }),
    CodyAction,
    DumbAware
