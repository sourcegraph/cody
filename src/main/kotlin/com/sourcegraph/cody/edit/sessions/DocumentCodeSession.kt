package com.sourcegraph.cody.edit.sessions

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.protocol.EditTask
import com.sourcegraph.cody.edit.FixupService
import java.util.concurrent.CompletableFuture

class DocumentCodeSession(
    controller: FixupService,
    editor: Editor,
    project: Project,
) : FixupSession(controller, project, editor) {
  override fun makeEditingRequest(agent: CodyAgent): CompletableFuture<EditTask> {

    return try {
      agent.server.commandsDocument()
    } catch (x: Exception) {
      logger.warn("Failed to execute editCommands/document request", x)
      CompletableFuture.failedFuture(x)
    }
  }

  override val commandName = "Document"

  companion object {
    private val logger = Logger.getInstance(DocumentCodeSession::class.java)
  }
}
