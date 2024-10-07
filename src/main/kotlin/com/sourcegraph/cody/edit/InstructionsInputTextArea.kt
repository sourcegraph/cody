package com.sourcegraph.cody.edit

import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.TextComponentEmptyText
import com.intellij.util.ui.JBUI
import java.util.function.Predicate

class InstructionsInputTextArea : JBTextArea() {

  init {
    lineWrap = true
    wrapStyleWord = true
    border = JBUI.Borders.empty(JBUI.insets(10, 15))

    emptyText.appendText(GHOST_TEXT, SimpleTextAttributes.GRAY_ATTRIBUTES)
    putClientProperty(
        TextComponentEmptyText.STATUS_VISIBLE_FUNCTION,
        Predicate { c: JBTextArea -> c.text.isEmpty() })
  }

  companion object {
    // TODO: Put this back when @-includes are in
    // const val GHOST_TEXT = "Instructions (@ to include code)"
    const val GHOST_TEXT = "Type what changes you want to make to this file..."
  }
}
