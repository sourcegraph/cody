package com.sourcegraph.cody.edit.lenses.providers

import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProviderMetadata

class EditWorkingCodeVisionProvider : EditCodeVisionProvider(EditWorkingCodeVisionProvider) {
  companion object : EditCodeVisionProviderMetadata() {
    override val ordering: CodeVisionRelativeOrdering =
        CodeVisionRelativeOrdering.CodeVisionRelativeOrderingFirst
    override val command: String = "cody.chat.focus"
  }
}
