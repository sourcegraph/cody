package com.sourcegraph.common.ui

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.NlsActions
import com.sourcegraph.cody.ui.BGTActionSetter
import javax.swing.Icon
import org.jetbrains.annotations.NotNull

abstract class DumbAwareBGTAction : DumbAwareAction {

  constructor() : super() {
    BGTActionSetter.runUpdateOnBackgroundThread(this)
  }

  constructor(icon: Icon?) : super(icon)

  constructor(text: @NlsActions.ActionText String?) : super(text)

  constructor(
      text: @NlsActions.ActionText String?,
      description: @NlsActions.ActionDescription String?,
      icon: Icon?
  ) : super(text, description, icon)
}

class SimpleDumbAwareBGTAction(
    text: @NlsActions.ActionText String? = null,
    private val action: (@NotNull AnActionEvent) -> Unit
) : DumbAwareBGTAction(text) {
  override fun actionPerformed(@NotNull e: AnActionEvent) {
    action(e)
  }
}
