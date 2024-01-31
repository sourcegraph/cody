package com.sourcegraph.cody.commands.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.autocomplete.CodyEditorFactoryListener
import com.sourcegraph.cody.chat.AgentChatSession
import com.sourcegraph.cody.commands.CommandId

class CommandsContextMenu {
  companion object {
    fun addCommandsToCodyContextMenu(project: Project) {
      val actionManager = ActionManager.getInstance()
      val group = actionManager.getAction("CodyEditorActions") as DefaultActionGroup

      // Loop on recipes and create an action for each new item
      for (commandId in CommandId.values()) {
        val actionId = "cody.command.$commandId"
        val existingAction = actionManager.getAction(actionId)
        val action: DumbAwareAction =
            object : DumbAwareAction(commandId.displayName) {
              override fun actionPerformed(e: AnActionEvent) {
                ToolWindowManager.getInstance(project)
                    .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
                    ?.show()
                FileEditorManager.getInstance(project).selectedTextEditor?.let {
                  CodyEditorFactoryListener.Util.informAgentAboutEditorChange(
                      it, hasFileChanged = false) {
                        CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
                          addChatSession(AgentChatSession.createFromCommand(project, commandId))
                        }
                      }
                }
              }
            }
        if (existingAction != null) {
          actionManager.replaceAction(actionId, action)
          group.replaceAction(existingAction, action)
        } else {
          actionManager.registerAction(actionId, action)
          group.addAction(action)
        }
      }
    }
  }
}
