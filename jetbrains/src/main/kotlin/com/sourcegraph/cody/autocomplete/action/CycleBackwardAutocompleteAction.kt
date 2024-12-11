package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.editor.actionSystem.EditorAction
import com.sourcegraph.cody.autocomplete.action.CycleCodyAutocompleteActionHandler.Companion.CycleDirection

class CycleBackwardAutocompleteAction :
    EditorAction(CycleCodyAutocompleteActionHandler(CycleDirection.BACKWARD)), CodyAction
