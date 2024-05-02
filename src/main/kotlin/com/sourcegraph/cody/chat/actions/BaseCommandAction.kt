package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.chat.AgentChatSession
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.ignore.ActionInIgnoredFileNotification
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.ignore.IgnorePolicy
import java.util.concurrent.Callable

abstract class BaseCommandAction : BaseChatAction() {

  abstract val myCommandId: CommandId

  override fun doAction(project: Project) {
    ApplicationManager.getApplication().assertIsDispatchThread()
    FileEditorManager.getInstance(project).selectedTextEditor?.let { editor ->
      val file = FileDocumentManager.getInstance().getFile(editor.document)
      val protocolFile = file?.let { ProtocolTextDocument.fromVirtualFile(editor, it) } ?: return

      ReadAction.nonBlocking(
              Callable { IgnoreOracle.getInstance(project).policyForUri(protocolFile.uri).get() })
          .expireWith(project)
          .finishOnUiThread(ModalityState.NON_MODAL) {
            when (it) {
              IgnorePolicy.USE -> {
                CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
                  // Race: The selected text editor could change before IgnoreOracle completes, and
                  // the command runs on the wrong document. Ignore rules will still be enforced by
                  // prompt construction so this is a correctness issue but not a safety issue.
                  // TODO: Fix this race by giving commands an explicit document to act on.
                  switchToChatSession(AgentChatSession.createFromCommand(project, myCommandId))
                }
              }
              else -> {
                // This file is ignored. Display an error and stop.
                ActionInIgnoredFileNotification().notify(project)
              }
            }
          }
          .submit(AppExecutorUtil.getAppExecutorService())
    }
  }
}
