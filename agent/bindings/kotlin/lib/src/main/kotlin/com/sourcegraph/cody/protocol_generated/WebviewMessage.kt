@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

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
) {

  enum class CommandEnum {
    @SerializedName("initialized") Initialized,
    @SerializedName("event") Event,
    @SerializedName("submit") Submit,
    @SerializedName("history") History,
    @SerializedName("restoreHistory") RestoreHistory,
    @SerializedName("deleteHistory") DeleteHistory,
    @SerializedName("links") Links,
    @SerializedName("show-page") `Show-page`,
    @SerializedName("chatModel") ChatModel,
    @SerializedName("get-chat-models") `Get-chat-models`,
    @SerializedName("openFile") OpenFile,
    @SerializedName("openLocalFileWithRange") OpenLocalFileWithRange,
    @SerializedName("edit") Edit,
    @SerializedName("context/get-remote-search-repos") `Context_get-remote-search-repos`,
    @SerializedName("context/choose-remote-search-repo") `Context_choose-remote-search-repo`,
    @SerializedName("context/remove-remote-search-repo") `Context_remove-remote-search-repo`,
    @SerializedName("embeddings/index") Embeddings_index,
    @SerializedName("symf/index") Symf_index,
    @SerializedName("insert") Insert,
    @SerializedName("newFile") NewFile,
    @SerializedName("copy") Copy,
    @SerializedName("auth") Auth,
    @SerializedName("abort") Abort,
    @SerializedName("reload") Reload,
    @SerializedName("simplified-onboarding") `Simplified-onboarding`,
    @SerializedName("getUserContext") GetUserContext,
    @SerializedName("search") Search,
    @SerializedName("show-search-result") `Show-search-result`,
    @SerializedName("reset") Reset,
    @SerializedName("attribution-search") `Attribution-search`,
    @SerializedName("ready") Ready,
  }

  enum class ActionEnum {
    @SerializedName("clear") Clear,
    @SerializedName("export") Export,
  }

  enum class EventTypeEnum {
    @SerializedName("Button") Button,
    @SerializedName("Keydown") Keydown,
  }

  enum class AuthKindEnum {
    @SerializedName("signin") Signin,
    @SerializedName("signout") Signout,
    @SerializedName("support") Support,
    @SerializedName("callback") Callback,
    @SerializedName("simplified-onboarding") `Simplified-onboarding`,
    @SerializedName("simplified-onboarding-exposure") `Simplified-onboarding-exposure`,
  }

  enum class OnboardingKindEnum {
    @SerializedName("web-sign-in-token") `Web-sign-in-token`,
  }
}

