package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.ChatError
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ContextItem
import com.sourcegraph.cody.agent.protocol.Repo

/**
 * A message sent from the webview to the extension host. See vscode/src/chat/protocol.ts for the
 * protocol.
 */
data class WebviewMessage(
    val command: String,
    val text: String? = null,
    val submitType: String? = null, // One of: "user", "suggestion", "example"
    val addEnhancedContext: Boolean? = null,
    val contextFiles: List<ContextItem>? = null,
    val error: ChatError? = null,
    val query: String? = null,
    val model: String? = null,
    val explicitRepos: List<Repo>? = null,
    val repoId: String? = null
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
    val userContextFiles: List<ContextItem>? = null,
    val errors: String?,
    val query: String? = null,
    val configFeatures: ConfigFeatures? = null,
    val enhancedContextStatus: EnhancedContextContextT? = null,
) {

  object Type {
    const val TRANSCRIPT = "transcript"
    const val ERRORS = "errors"
    const val USER_CONTEXT_FILES = "userContextFiles"
    const val SET_CONFIG_FEATURES = "setConfigFeatures"
    const val ENHANCED_CONTEXT_STATUS = "enhanced-context"
  }
}

data class WebviewPostMessageParams(val id: String, val message: ExtensionMessage)

data class ConfigFeatures(
    val attribution: Boolean,
)

data class EnhancedContextContextT(val groups: List<ContextGroup>)

data class ContextGroup(
    val dir: String? = null, // URI
    val displayName: String,
    val providers: List<ContextProvider>
)

// This is a subset of the ContextProvider type in lib/shared/src/codebase-context/context-status.ts
// It covers remote search repositories.
data class ContextProvider(
    val kind: String, // "embeddings", "search"

    // if kind is "search"
    val type: String? = null, // "local", "remote"

    // if kind is "search" and type is "remote"
    val state: String? = null, // "ready", "no-match",
    val id: String? = null,
    val inclusion: String? = null, // "auto" or "manual"
    val isIgnored: Boolean? = null,
)
