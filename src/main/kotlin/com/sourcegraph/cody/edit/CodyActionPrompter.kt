package com.sourcegraph.cody.edit

import com.intellij.openapi.actionSystem.ActionPromoter
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DataContext

internal class CodyActionPromoter : ActionPromoter {
  override fun promote(actions: List<AnAction>, context: DataContext): List<AnAction> {
    val (promoted, unknown) = actions.partition { it is InlineEditPromptEditCodeAction }
    return promoted + unknown
  }
}
