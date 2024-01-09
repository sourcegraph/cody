package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.ChatError
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ContextFile
import com.sourcegraph.cody.agent.protocol.PanelNotFoundError

/**
 * A message sent from the webview to the extension host. See vscode/src/chat/protocol.ts for the
 * protocol.
 */
data class WebviewMessage(
    val command: String,
    val text: String,
    val submitType: String, // One of: "user", "suggestion", "example"
    val addEnhancedContext: Boolean? = null,
    val contextFiles: List<ContextFile>? = null,
    val error: ChatError? = null,
)

data class WebviewReceiveMessageParams(val id: String, val message: WebviewMessage)

/**
 * A message sent from the extension host to the webview. See vscode/src/chat/protocol.ts for the
 * protocol.
 */
data class ExtensionMessage(
    val type: String,
    val messages: List<ChatMessage>? = null,
    val isMessageInProgress: Boolean? = null,
    val chatID: String? = null,
    val isTranscriptError: Boolean? = null,
    val customPrompts: List<List<Any>>? = null,
    val context: Any? = null,
    val errors: String?
) {

  object Type {
    const val TRANSCRIPT = "transcript"
    const val ERRORS = "errors"
  }

  fun toPanelNotFoundError(): PanelNotFoundError? {
    // e.g.: "No panel with id 414f6f9c-ed62-4d7b-8ebd-023ded81e9da found"
    if (this.errors?.matches(Regex("^No panel with id .* found$")) == true) {
      return PanelNotFoundError(this.errors)
    }
    return null
  }
}

data class WebviewPostMessageParams(val id: String, val message: ExtensionMessage)
