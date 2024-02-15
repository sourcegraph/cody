@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class WebviewMessage(
  val command: CommandEnum? = null, // Oneof: initialized, event, submit, history, restoreHistory, deleteHistory, links, show-page, chatModel, get-chat-models, openFile, openLocalFileWithRange, edit, context/get-remote-search-repos, context/choose-remote-search-repo, context/remove-remote-search-repo, embeddings/index, symf/index, insert, newFile, copy, auth, abort, reload, simplified-onboarding, getUserContext, search, show-search-result, reset, attribution-search, ready
  val eventName: String? = null,
  val properties: TelemetryEventProperties? = null,
  val addEnhancedContext: Boolean? = null,
  val contextFiles: List<ContextFile>? = null,
  val text: String? = null,
  val submitType: ChatSubmitType? = null, // Oneof: user, user-newchat
  val action: ActionEnum? = null, // Oneof: clear, export
  val chatID: String? = null,
  val value: String? = null,
  val page: String? = null,
  val model: String? = null,
  val uri: Uri? = null,
  val range: ActiveTextEditorSelectionRange? = null,
  val filePath: String? = null,
  val index: Int? = null,
  val explicitRepos: List<Repo>? = null,
  val repoId: String? = null,
  val metadata: CodeBlockMeta? = null,
  val eventType: EventTypeEnum? = null, // Oneof: Button, Keydown
  val authKind: AuthKindEnum? = null, // Oneof: signin, signout, support, callback, simplified-onboarding, simplified-onboarding-exposure
  val endpoint: String? = null,
  val authMethod: AuthMethod? = null, // Oneof: dotcom, github, gitlab, google
  val onboardingKind: OnboardingKindEnum? = null, // Oneof: web-sign-in-token
  val query: String? = null,
  val snippet: String? = null,
)

