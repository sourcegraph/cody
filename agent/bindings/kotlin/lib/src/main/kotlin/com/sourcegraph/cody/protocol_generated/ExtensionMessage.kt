@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class ExtensionMessage {
  companion object {
    val deserializer: JsonDeserializer<ExtensionMessage> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("type").asString) {
          "config" -> context.deserialize<ConfigExtensionMessage>(element, ConfigExtensionMessage::class.java)
          "search:config" -> context.deserialize<Search_configExtensionMessage>(element, Search_configExtensionMessage::class.java)
          "history" -> context.deserialize<HistoryExtensionMessage>(element, HistoryExtensionMessage::class.java)
          "transcript" -> context.deserialize<TranscriptExtensionMessage>(element, TranscriptExtensionMessage::class.java)
          "view" -> context.deserialize<ViewExtensionMessage>(element, ViewExtensionMessage::class.java)
          "errors" -> context.deserialize<ErrorsExtensionMessage>(element, ErrorsExtensionMessage::class.java)
          "notice" -> context.deserialize<NoticeExtensionMessage>(element, NoticeExtensionMessage::class.java)
          "transcript-errors" -> context.deserialize<`transcript-errorsExtensionMessage`>(element, `transcript-errorsExtensionMessage`::class.java)
          "userContextFiles" -> context.deserialize<UserContextFilesExtensionMessage>(element, UserContextFilesExtensionMessage::class.java)
          "chatModels" -> context.deserialize<ChatModelsExtensionMessage>(element, ChatModelsExtensionMessage::class.java)
          "update-search-results" -> context.deserialize<`update-search-resultsExtensionMessage`>(element, `update-search-resultsExtensionMessage`::class.java)
          "index-updated" -> context.deserialize<`index-updatedExtensionMessage`>(element, `index-updatedExtensionMessage`::class.java)
          "enhanced-context" -> context.deserialize<`enhanced-contextExtensionMessage`>(element, `enhanced-contextExtensionMessage`::class.java)
          "attribution" -> context.deserialize<AttributionExtensionMessage>(element, AttributionExtensionMessage::class.java)
          "setChatEnabledConfigFeature" -> context.deserialize<SetChatEnabledConfigFeatureExtensionMessage>(element, SetChatEnabledConfigFeatureExtensionMessage::class.java)
          "webview-state" -> context.deserialize<`webview-stateExtensionMessage`>(element, `webview-stateExtensionMessage`::class.java)
          "context/remote-repos" -> context.deserialize<`context_remote-reposExtensionMessage`>(element, `context_remote-reposExtensionMessage`::class.java)
          "setConfigFeatures" -> context.deserialize<SetConfigFeaturesExtensionMessage>(element, SetConfigFeaturesExtensionMessage::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ConfigExtensionMessage(
  val type: TypeEnum? = null, // Oneof: config
  val config: ConfigParams? = null,
  val authStatus: AuthStatus? = null,
  val workspaceFolderUris: List<String>? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("config") Config,
  }
}

data class Search_configExtensionMessage(
  val type: TypeEnum? = null, // Oneof: search:config
  val workspaceFolderUris: List<String>? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("search:config") Search_config,
  }
}

data class HistoryExtensionMessage(
  val type: TypeEnum? = null, // Oneof: history
  val localHistory: UserLocalHistory? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("history") History,
  }
}

data class TranscriptExtensionMessage(
  val type: TypeEnum? = null, // Oneof: transcript
  val messages: List<ChatMessage>? = null,
  val isMessageInProgress: Boolean? = null,
  val chatID: String? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("transcript") Transcript,
  }
}

data class ViewExtensionMessage(
  val type: TypeEnum? = null, // Oneof: view
  val view: View? = null, // Oneof: chat, login
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("view") View,
  }
}

data class ErrorsExtensionMessage(
  val type: TypeEnum? = null, // Oneof: errors
  val errors: String? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("errors") Errors,
  }
}

data class NoticeExtensionMessage(
  val type: TypeEnum? = null, // Oneof: notice
  val notice: NoticeParams? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("notice") Notice,
  }
}

data class `transcript-errorsExtensionMessage`(
  val type: TypeEnum? = null, // Oneof: transcript-errors
  val isTranscriptError: Boolean? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("transcript-errors") `Transcript-errors`,
  }
}

data class UserContextFilesExtensionMessage(
  val type: TypeEnum? = null, // Oneof: userContextFiles
  val userContextFiles: List<ContextItem>? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("userContextFiles") UserContextFiles,
  }
}

data class ChatModelsExtensionMessage(
  val type: TypeEnum? = null, // Oneof: chatModels
  val models: List<ModelProvider>? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("chatModels") ChatModels,
  }
}

data class `update-search-resultsExtensionMessage`(
  val type: TypeEnum? = null, // Oneof: update-search-results
  val results: List<SearchPanelFile>? = null,
  val query: String? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("update-search-results") `Update-search-results`,
  }
}

data class `index-updatedExtensionMessage`(
  val type: TypeEnum? = null, // Oneof: index-updated
  val scopeDir: String? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("index-updated") `Index-updated`,
  }
}

data class `enhanced-contextExtensionMessage`(
  val type: TypeEnum? = null, // Oneof: enhanced-context
  val enhancedContextStatus: EnhancedContextContextT? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("enhanced-context") `Enhanced-context`,
  }
}

data class AttributionExtensionMessage(
  val type: TypeEnum? = null, // Oneof: attribution
  val snippet: String? = null,
  val attribution: AttributionParams? = null,
  val error: String? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("attribution") Attribution,
  }
}

data class SetChatEnabledConfigFeatureExtensionMessage(
  val type: TypeEnum? = null, // Oneof: setChatEnabledConfigFeature
  val data: Boolean? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("setChatEnabledConfigFeature") SetChatEnabledConfigFeature,
  }
}

data class `webview-stateExtensionMessage`(
  val type: TypeEnum? = null, // Oneof: webview-state
  val isActive: Boolean? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("webview-state") `Webview-state`,
  }
}

data class `context_remote-reposExtensionMessage`(
  val type: TypeEnum? = null, // Oneof: context/remote-repos
  val repos: List<Repo>? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("context/remote-repos") `Context_remote-repos`,
  }
}

data class SetConfigFeaturesExtensionMessage(
  val type: TypeEnum? = null, // Oneof: setConfigFeatures
  val configFeatures: ConfigFeaturesParams? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("setConfigFeatures") SetConfigFeatures,
  }
}

