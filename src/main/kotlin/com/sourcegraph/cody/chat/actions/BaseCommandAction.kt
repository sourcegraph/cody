package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.autocomplete.CodyEditorFactoryListener
import com.sourcegraph.cody.chat.AgentChatSession
import com.sourcegraph.cody.commands.CommandId

abstract class BaseCommandAction : BaseChatAction() {

  abstract val myCommandId: CommandId

  override fun doAction(project: Project) {

    FileEditorManager.getInstance(project).selectedTextEditor?.let {
      CodyEditorFactoryListener.Util.informAgentAboutEditorChange(it, hasFileChanged = false) {
        CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
          switchToChatSession(AgentChatSession.createFromCommand(project, myCommandId))
        }
      }
    }
  }
}
