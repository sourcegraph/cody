package com.sourcegraph.common.ui

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.NlsActions
import javax.swing.Icon
import org.jetbrains.annotations.NotNull

abstract class DumbAwareEDTAction : DumbAwareAction {

  constructor() : super()

  constructor(icon: Icon?) : super(icon)

  constructor(text: @NlsActions.ActionText String?) : super(text)

  constructor(
      text: @NlsActions.ActionText String?,
      description: @NlsActions.ActionDescription String?,
      icon: Icon?
  ) : super(text, description, icon)

  override fun getActionUpdateThread(): ActionUpdateThread {
    return ActionUpdateThread.EDT
  }
}

class SimpleDumbAwareEDTAction(
    text: @NlsActions.ActionText String? = null,
    private val action: (@NotNull AnActionEvent) -> Unit
) : DumbAwareEDTAction(text) {
  override fun actionPerformed(@NotNull e: AnActionEvent) {
    action(e)
  }
}
