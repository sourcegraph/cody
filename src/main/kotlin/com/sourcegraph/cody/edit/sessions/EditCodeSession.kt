package com.sourcegraph.cody.edit.sessions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.EditTask
import com.sourcegraph.cody.agent.protocol.InlineEditParams
import com.sourcegraph.cody.edit.FixupService
import java.util.concurrent.CompletableFuture

/**
 * Manages the state machine for inline-edit requests.
 *
 * @param instructions The user's instructions for fixing up the code.
 */
class EditCodeSession(
    controller: FixupService,
    editor: Editor,
    project: Project,
    val instructions: String,
    private val chatModelProvider: ChatModelsResponse.ChatModelProvider,
) : FixupSession(controller, project, editor) {

  override fun makeEditingRequest(agent: CodyAgent): CompletableFuture<EditTask> {
    val params = InlineEditParams(instructions, chatModelProvider.model)
    return agent.server.commandsEdit(params)
  }
}
