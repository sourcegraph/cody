package com.sourcegraph.cody.context.ui

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.ui.DumbAwareActionButton
import com.sourcegraph.cody.ui.BGTActionSetter
import javax.swing.Icon

open class ContextToolbarButton(
    name: String,
    icon: Icon,
    private val buttonAction: () -> Unit = {}
) : DumbAwareActionButton(name, icon) {

  init {
    BGTActionSetter.runUpdateOnBackgroundThread(this)
  }

  override fun isDumbAware(): Boolean = true

  override fun actionPerformed(p0: AnActionEvent) {
    buttonAction()
  }
}
