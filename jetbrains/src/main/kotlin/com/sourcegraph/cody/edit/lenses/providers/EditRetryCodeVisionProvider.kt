package com.sourcegraph.cody.edit.lenses.providers

import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.EditCodeVisionProviderMetadata

class EditRetryCodeVisionProvider : EditCodeVisionProvider(EditRetryCodeVisionProvider) {
  companion object : EditCodeVisionProviderMetadata() {
    override val ordering: CodeVisionRelativeOrdering =
        CodeVisionRelativeOrdering.CodeVisionRelativeOrderingLast
    override val command: String = "cody.fixup.codelens.retry"
  }
}
