@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class WebviewMessage {
  companion object {
    val deserializer: JsonDeserializer<WebviewMessage> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("command").asString) {
          "ready" -> context.deserialize<ReadyWebviewMessage>(element, ReadyWebviewMessage::class.java)
          "initialized" -> context.deserialize<InitializedWebviewMessage>(element, InitializedWebviewMessage::class.java)
          "event" -> context.deserialize<EventWebviewMessage>(element, EventWebviewMessage::class.java)
          "submit" -> context.deserialize<SubmitWebviewMessage>(element, SubmitWebviewMessage::class.java)
          "history" -> context.deserialize<HistoryWebviewMessage>(element, HistoryWebviewMessage::class.java)
          "restoreHistory" -> context.deserialize<RestoreHistoryWebviewMessage>(element, RestoreHistoryWebviewMessage::class.java)
          "deleteHistory" -> context.deserialize<DeleteHistoryWebviewMessage>(element, DeleteHistoryWebviewMessage::class.java)
          "links" -> context.deserialize<LinksWebviewMessage>(element, LinksWebviewMessage::class.java)
          "show-page" -> context.deserialize<`show-pageWebviewMessage`>(element, `show-pageWebviewMessage`::class.java)
          "chatModel" -> context.deserialize<ChatModelWebviewMessage>(element, ChatModelWebviewMessage::class.java)
          "get-chat-models" -> context.deserialize<`get-chat-modelsWebviewMessage`>(element, `get-chat-modelsWebviewMessage`::class.java)
          "openFile" -> context.deserialize<OpenFileWebviewMessage>(element, OpenFileWebviewMessage::class.java)
          "openLocalFileWithRange" -> context.deserialize<OpenLocalFileWithRangeWebviewMessage>(element, OpenLocalFileWithRangeWebviewMessage::class.java)
          "edit" -> context.deserialize<EditWebviewMessage>(element, EditWebviewMessage::class.java)
          "context/get-remote-search-repos" -> context.deserialize<`context_get-remote-search-reposWebviewMessage`>(element, `context_get-remote-search-reposWebviewMessage`::class.java)
          "context/choose-remote-search-repo" -> context.deserialize<`context_choose-remote-search-repoWebviewMessage`>(element, `context_choose-remote-search-repoWebviewMessage`::class.java)
          "context/remove-remote-search-repo" -> context.deserialize<`context_remove-remote-search-repoWebviewMessage`>(element, `context_remove-remote-search-repoWebviewMessage`::class.java)
          "embeddings/index" -> context.deserialize<Embeddings_indexWebviewMessage>(element, Embeddings_indexWebviewMessage::class.java)
          "symf/index" -> context.deserialize<Symf_indexWebviewMessage>(element, Symf_indexWebviewMessage::class.java)
          "insert" -> context.deserialize<InsertWebviewMessage>(element, InsertWebviewMessage::class.java)
          "newFile" -> context.deserialize<NewFileWebviewMessage>(element, NewFileWebviewMessage::class.java)
          "copy" -> context.deserialize<CopyWebviewMessage>(element, CopyWebviewMessage::class.java)
          "auth" -> context.deserialize<AuthWebviewMessage>(element, AuthWebviewMessage::class.java)
          "abort" -> context.deserialize<AbortWebviewMessage>(element, AbortWebviewMessage::class.java)
          "reload" -> context.deserialize<ReloadWebviewMessage>(element, ReloadWebviewMessage::class.java)
          "simplified-onboarding" -> context.deserialize<`simplified-onboardingWebviewMessage`>(element, `simplified-onboardingWebviewMessage`::class.java)
          "getUserContext" -> context.deserialize<GetUserContextWebviewMessage>(element, GetUserContextWebviewMessage::class.java)
          "search" -> context.deserialize<SearchWebviewMessage>(element, SearchWebviewMessage::class.java)
          "show-search-result" -> context.deserialize<`show-search-resultWebviewMessage`>(element, `show-search-resultWebviewMessage`::class.java)
          "reset" -> context.deserialize<ResetWebviewMessage>(element, ResetWebviewMessage::class.java)
          "attribution-search" -> context.deserialize<`attribution-searchWebviewMessage`>(element, `attribution-searchWebviewMessage`::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ReadyWebviewMessage(
  val command: CommandEnum? = null, // Oneof: ready
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("ready") Ready,
  }
}

data class InitializedWebviewMessage(
  val command: CommandEnum? = null, // Oneof: initialized
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("initialized") Initialized,
  }
}

data class EventWebviewMessage(
  val command: CommandEnum? = null, // Oneof: event
  val eventName: String? = null,
  val properties: TelemetryEventProperties? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("event") Event,
  }
}

data class SubmitWebviewMessage(
  val command: CommandEnum? = null, // Oneof: submit
  val addEnhancedContext: Boolean? = null,
  val contextFiles: List<ContextItem>? = null,
  val text: String? = null,
  val submitType: ChatSubmitType? = null, // Oneof: user, user-newchat
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("submit") Submit,
  }
}

data class HistoryWebviewMessage(
  val command: CommandEnum? = null, // Oneof: history
  val action: ActionEnum? = null, // Oneof: clear, export
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("history") History,
  }

  enum class ActionEnum {
    @SerializedName("clear") Clear,
    @SerializedName("export") Export,
  }
}

data class RestoreHistoryWebviewMessage(
  val command: CommandEnum? = null, // Oneof: restoreHistory
  val chatID: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("restoreHistory") RestoreHistory,
  }
}

data class DeleteHistoryWebviewMessage(
  val command: CommandEnum? = null, // Oneof: deleteHistory
  val chatID: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("deleteHistory") DeleteHistory,
  }
}

data class LinksWebviewMessage(
  val command: CommandEnum? = null, // Oneof: links
  val value: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("links") Links,
  }
}

data class `show-pageWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: show-page
  val page: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("show-page") `Show-page`,
  }
}

data class ChatModelWebviewMessage(
  val command: CommandEnum? = null, // Oneof: chatModel
  val model: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("chatModel") ChatModel,
  }
}

data class `get-chat-modelsWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: get-chat-models
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("get-chat-models") `Get-chat-models`,
  }
}

data class OpenFileWebviewMessage(
  val command: CommandEnum? = null, // Oneof: openFile
  val uri: Uri? = null,
  val range: RangeData? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("openFile") OpenFile,
  }
}

data class OpenLocalFileWithRangeWebviewMessage(
  val command: CommandEnum? = null, // Oneof: openLocalFileWithRange
  val filePath: String? = null,
  val range: RangeData? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("openLocalFileWithRange") OpenLocalFileWithRange,
  }
}

data class EditWebviewMessage(
  val command: CommandEnum? = null, // Oneof: edit
  val addEnhancedContext: Boolean? = null,
  val contextFiles: List<ContextItem>? = null,
  val text: String? = null,
  val index: Int? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("edit") Edit,
  }
}

data class `context_get-remote-search-reposWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: context/get-remote-search-repos
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("context/get-remote-search-repos") `Context_get-remote-search-repos`,
  }
}

data class `context_choose-remote-search-repoWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: context/choose-remote-search-repo
  val explicitRepos: List<Repo>? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("context/choose-remote-search-repo") `Context_choose-remote-search-repo`,
  }
}

data class `context_remove-remote-search-repoWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: context/remove-remote-search-repo
  val repoId: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("context/remove-remote-search-repo") `Context_remove-remote-search-repo`,
  }
}

data class Embeddings_indexWebviewMessage(
  val command: CommandEnum? = null, // Oneof: embeddings/index
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("embeddings/index") Embeddings_index,
  }
}

data class Symf_indexWebviewMessage(
  val command: CommandEnum? = null, // Oneof: symf/index
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("symf/index") Symf_index,
  }
}

data class InsertWebviewMessage(
  val command: CommandEnum? = null, // Oneof: insert
  val text: String? = null,
  val metadata: CodeBlockMeta? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("insert") Insert,
  }
}

data class NewFileWebviewMessage(
  val command: CommandEnum? = null, // Oneof: newFile
  val text: String? = null,
  val metadata: CodeBlockMeta? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("newFile") NewFile,
  }
}

data class CopyWebviewMessage(
  val command: CommandEnum? = null, // Oneof: copy
  val eventType: EventTypeEnum? = null, // Oneof: Button, Keydown
  val text: String? = null,
  val metadata: CodeBlockMeta? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("copy") Copy,
  }

  enum class EventTypeEnum {
    @SerializedName("Button") Button,
    @SerializedName("Keydown") Keydown,
  }
}

data class AuthWebviewMessage(
  val command: CommandEnum? = null, // Oneof: auth
  val authKind: AuthKindEnum? = null, // Oneof: signin, signout, support, callback, simplified-onboarding, simplified-onboarding-exposure
  val endpoint: String? = null,
  val value: String? = null,
  val authMethod: AuthMethod? = null, // Oneof: dotcom, github, gitlab, google
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("auth") Auth,
  }

  enum class AuthKindEnum {
    @SerializedName("signin") Signin,
    @SerializedName("signout") Signout,
    @SerializedName("support") Support,
    @SerializedName("callback") Callback,
    @SerializedName("simplified-onboarding") `Simplified-onboarding`,
    @SerializedName("simplified-onboarding-exposure") `Simplified-onboarding-exposure`,
  }
}

data class AbortWebviewMessage(
  val command: CommandEnum? = null, // Oneof: abort
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("abort") Abort,
  }
}

data class ReloadWebviewMessage(
  val command: CommandEnum? = null, // Oneof: reload
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("reload") Reload,
  }
}

data class `simplified-onboardingWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: simplified-onboarding
  val onboardingKind: OnboardingKindEnum? = null, // Oneof: web-sign-in-token
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("simplified-onboarding") `Simplified-onboarding`,
  }

  enum class OnboardingKindEnum {
    @SerializedName("web-sign-in-token") `Web-sign-in-token`,
  }
}

data class GetUserContextWebviewMessage(
  val command: CommandEnum? = null, // Oneof: getUserContext
  val query: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("getUserContext") GetUserContext,
  }
}

data class SearchWebviewMessage(
  val command: CommandEnum? = null, // Oneof: search
  val query: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("search") Search,
  }
}

data class `show-search-resultWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: show-search-result
  val uri: Uri? = null,
  val range: RangeData? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("show-search-result") `Show-search-result`,
  }
}

data class ResetWebviewMessage(
  val command: CommandEnum? = null, // Oneof: reset
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("reset") Reset,
  }
}

data class `attribution-searchWebviewMessage`(
  val command: CommandEnum? = null, // Oneof: attribution-search
  val snippet: String? = null,
) : WebviewMessage() {

  enum class CommandEnum {
    @SerializedName("attribution-search") `Attribution-search`,
  }
}

