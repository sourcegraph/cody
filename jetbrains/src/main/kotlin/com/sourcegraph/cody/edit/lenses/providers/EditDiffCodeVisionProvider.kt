package com.sourcegraph.cody.edit.lenses.providers

import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProviderMetadata

class EditDiffCodeVisionProvider : EditCodeVisionProvider(EditDiffCodeVisionProvider) {
  companion object : EditCodeVisionProviderMetadata() {
    override val ordering: CodeVisionRelativeOrdering = showAfter(EditUndoCodeVisionProvider)
    override val command: String = "cody.fixup.codelens.diff"
  }
}
