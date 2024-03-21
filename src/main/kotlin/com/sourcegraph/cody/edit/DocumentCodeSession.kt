package com.sourcegraph.cody.edit

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.protocol.EditTask
import java.util.concurrent.CompletableFuture

class DocumentCodeSession(
    controller: FixupService,
    editor: Editor,
    project: Project,
    document: Document
) : FixupSession(controller, editor, project, document) {
  private val logger = Logger.getInstance(DocumentCodeSession::class.java)

  override fun makeEditingRequest(agent: CodyAgent): CompletableFuture<EditTask> {
    return agent.server.commandsDocument()
  }

  override fun retry() {
    // TODO: The actual prompt we sent is displayed as ghost text in the text input field, in VS
    // Code.
    // E.g. "Write a brief documentation comment for the selected code <etc.>"
    // We need to send the prompt along with the lenses, so that the client can display it.
    EditCommandPrompt(controller, editor, "Edit instructions and Retry").displayPromptUI()
  }

  override fun diff() {
    // TODO: Use DiffManager and bring up a diff of the changed region.
    // You can see it in action now by clicking the green gutter to the left of Cody changes.
    logger.warn("Code Lenses: Show Diff")
  }

  override fun dispose() {}
}
