package com.sourcegraph.cody.commands.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAwareAction
import com.sourcegraph.cody.chat.CommandId

class CommandsContextMenu {
  companion object {
    fun addCommandsToCodyContextMenu(executeCommand: (CommandId) -> Unit) {
      val actionManager = ActionManager.getInstance()
      val group = actionManager.getAction("CodyEditorActions") as DefaultActionGroup

      // Loop on recipes and create an action for each new item
      for (commandId in CommandId.values()) {
        val actionId = "cody.command.$commandId"
        val existingAction = actionManager.getAction(actionId)
        if (existingAction != null) {
          continue
        }
        val action: DumbAwareAction =
            object : DumbAwareAction(commandId.displayName) {
              override fun actionPerformed(e: AnActionEvent) {
                executeCommand(commandId)
              }
            }
        actionManager.registerAction(actionId, action)
        group.addAction(action)
      }
    }
  }
}
