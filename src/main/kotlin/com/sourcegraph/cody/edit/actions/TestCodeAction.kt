package com.sourcegraph.cody.edit.actions

class TestCodeAction :
    NonInteractiveEditCommandAction({ editor, fixupService ->
      fixupService.startTestCode(editor)
    }) {
  companion object {
    const val ID: String = "cody.testCodeAction"
  }
}
