package com.sourcegraph.cody.edit.lenses.providers

import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.intellij.ui.JBColor
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProviderMetadata

class EditCancelCodeVisionProvider : EditCodeVisionProvider(EditCancelCodeVisionProvider) {
  companion object : EditCodeVisionProviderMetadata() {
    override val ordering: CodeVisionRelativeOrdering = showAfter(EditWorkingCodeVisionProvider)
    override val command: String = "cody.fixup.codelens.cancel"
    override val textColor: JBColor = JBColor.RED
  }
}
