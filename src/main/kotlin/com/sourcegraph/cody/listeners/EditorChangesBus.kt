package com.sourcegraph.cody.listeners

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument

typealias EditorChangesListener = (project: Project?, textDocument: ProtocolTextDocument) -> Unit

object EditorChangesBus {
  @Volatile var listeners: List<EditorChangesListener> = listOf()

  fun addListener(notify: EditorChangesListener) {
    listeners = listeners + notify
  }

  fun documentChanged(project: Project?, textDocument: ProtocolTextDocument) {
    listeners.forEach { it(project, textDocument) }
  }
}
