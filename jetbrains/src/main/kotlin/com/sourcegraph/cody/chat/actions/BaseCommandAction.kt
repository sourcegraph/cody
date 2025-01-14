package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.ExecuteCommandParams
import com.sourcegraph.cody.agent.protocol_generated.Ignore_TestResult
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.ignore.ActionInIgnoredFileNotification
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.utils.CodyEditorUtil
import java.util.concurrent.Callable

abstract class BaseCommandAction : DumbAwareEDTAction() {

  abstract val myCommandId: CommandId

  override fun actionPerformed(event: AnActionEvent) {
    doAction(event.project ?: return)
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    val project = e.project
    e.presentation.isVisible =
        isCodyEnabled() && project != null && CodyAuthService.getInstance(project).isActivated()
  }

  open fun doAction(project: Project) {
    ApplicationManager.getApplication().assertIsDispatchThread()
    CodyEditorUtil.getSelectedEditors(project).firstOrNull()?.let { editor ->
      val file = FileDocumentManager.getInstance().getFile(editor.document)
      val protocolFile =
          file?.let { ProtocolTextDocumentExt.fromVirtualEditorFile(editor, it) } ?: return

      ReadAction.nonBlocking(
              Callable { IgnoreOracle.getInstance(project).policyForUri(protocolFile.uri).get() })
          .expireWith(project)
          .finishOnUiThread(ModalityState.nonModal()) {
            when (it) {
              Ignore_TestResult.PolicyEnum.Use -> {
                CodyAgentService.withAgent(project) { agent ->
                  agent.server.command_execute(
                      ExecuteCommandParams(
                          command =
                              when (myCommandId) {
                                CommandId.Explain -> "cody.command.explain-code"
                                CommandId.Smell -> "cody.command.smell-code"
                              },
                          arguments = emptyList(),
                      ))
                }
              }
              else -> {
                // This file is ignored. Display an error and stop.
                ActionInIgnoredFileNotification.maybeNotify(project)
              }
            }
          }
          .submit(AppExecutorUtil.getAppExecutorService())
    }
  }
}
