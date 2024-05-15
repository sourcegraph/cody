package com.sourcegraph.cody.edit.actions

class DocumentCodeAction :
    NonInteractiveEditCommandAction({ editor, fixupService ->
      fixupService.startDocumentCode(editor)
    }) {
  companion object {
    const val ID: String = "cody.documentCodeAction"
  }
}
