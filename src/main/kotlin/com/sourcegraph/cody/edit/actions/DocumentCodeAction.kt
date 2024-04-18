package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.project.DumbAware
import com.sourcegraph.cody.autocomplete.action.CodyAction

class DocumentCodeAction :
    EditCommandAction({ editor, fixupService -> fixupService.startDocumentCode(editor) }),
    CodyAction,
    DumbAware
