@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class WebviewMessage(
  var command: String? = null, // Oneof: initialized, event, submit, history, restoreHistory, deleteHistory, links, show-page, chatModel, get-chat-models, openFile, openLocalFileWithRange, edit, context/get-remote-search-repos, context/choose-remote-search-repo, context/remove-remote-search-repo, embeddings/index, symf/index, insert, newFile, copy, auth, abort, reload, simplified-onboarding, getUserContext, search, show-search-result, reset, attribution-search, ready
  var eventName: String? = null,
  var properties: TelemetryEventProperties? = null,
  var addEnhancedContext: Boolean? = null,
  var contextFiles: List<ContextFile>? = null,
  var text: String? = null,
  var submitType: ChatSubmitType? = null, // Oneof: user, user-newchat
  var action: String? = null, // Oneof: clear, export
  var chatID: String? = null,
  var value: String? = null,
  var page: String? = null,
  var model: String? = null,
  var uri: Uri? = null,
  var range: ActiveTextEditorSelectionRange? = null,
  var filePath: String? = null,
  var index: Int? = null,
  var explicitRepos: List<Repo>? = null,
  var repoId: String? = null,
  var metadata: CodeBlockMeta? = null,
  var eventType: String? = null, // Oneof: Button, Keydown
  var authKind: String? = null, // Oneof: signin, signout, support, callback, simplified-onboarding, simplified-onboarding-exposure
  var endpoint: String? = null,
  var authMethod: AuthMethod? = null, // Oneof: dotcom, github, gitlab, google
  var onboardingKind: String? = null, // Oneof: web-sign-in-token
  var query: String? = null,
  var snippet: String? = null,
)

