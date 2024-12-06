package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.actionSystem.ActionPromoter
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.actionSystem.EditorAction

class CodyActionPromoter : ActionPromoter {
  override fun promote(
      actions: MutableList<out AnAction>,
      context: DataContext
  ): MutableList<AnAction>? {
    return if (actions.stream().noneMatch { action: AnAction? ->
      action is CodyAction && action is EditorAction
    }) {
      null
    } else {
      val result: ArrayList<AnAction> = ArrayList(actions)
      result.sortWith { a: AnAction?, b: AnAction? ->
        when {
          a is CodyAction -> -1
          b is CodyAction -> 1
          else -> 0
        }
      }
      result
    }
  }
}
