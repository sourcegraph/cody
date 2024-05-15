package com.sourcegraph.cody.edit.actions

class EditCodeAction :
    EditCommandAction({ editor, fixupService -> fixupService.startCodeEdit(editor) }) {
  companion object {
    const val ID: String = "cody.editCodeAction"
  }
}
