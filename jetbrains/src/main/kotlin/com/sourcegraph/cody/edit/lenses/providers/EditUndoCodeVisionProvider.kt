package com.sourcegraph.cody.edit.lenses.providers

import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.intellij.ui.JBColor
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProviderMetadata

class EditUndoCodeVisionProvider : EditCodeVisionProvider(EditUndoCodeVisionProvider) {
  companion object : EditCodeVisionProviderMetadata() {
    override val ordering: CodeVisionRelativeOrdering = showAfter(EditAcceptCodeVisionProvider)
    override val command: String = "cody.fixup.codelens.undo"
    override val textColor: JBColor = JBColor.RED
  }
}
