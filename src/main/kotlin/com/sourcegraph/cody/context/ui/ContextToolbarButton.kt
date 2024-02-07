package com.sourcegraph.cody.context.ui

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.ui.ToolbarDecorator
import javax.swing.Icon

open class ContextToolbarButton(
    name: String,
    icon: Icon,
    private val buttonAction: () -> Unit = {}
) : ToolbarDecorator.ElementActionButton(name, icon) {
  override fun isDumbAware(): Boolean = true

  override fun actionPerformed(p0: AnActionEvent) {
    buttonAction()
  }
}
