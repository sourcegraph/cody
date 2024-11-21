package com.sourcegraph.cody.edit.lenses.providers

import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.intellij.ui.JBColor
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProviderMetadata

class EditAcceptCodeVisionProvider : EditCodeVisionProvider(EditAcceptCodeVisionProvider) {
  companion object : EditCodeVisionProviderMetadata() {
    override val ordering: CodeVisionRelativeOrdering =
        CodeVisionRelativeOrdering.CodeVisionRelativeOrderingFirst
    override val command: String = "cody.fixup.codelens.accept"
    override val textColor: JBColor = JBColor.GREEN
  }
}
