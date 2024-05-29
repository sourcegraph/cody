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
          "clientState" -> context.deserialize<ClientStateExtensionMessage>(element, ClientStateExtensionMessage::class.java)
          "clientAction" -> context.deserialize<ClientActionExtensionMessage>(element, ClientActionExtensionMessage::class.java)
          "chatModels" -> context.deserialize<ChatModelsExtensionMessage>(element, ChatModelsExtensionMessage::class.java)
          "update-search-results" -> context.deserialize<`update-search-resultsExtensionMessage`>(element, `update-search-resultsExtensionMessage`::class.java)
          "index-updated" -> context.deserialize<`index-updatedExtensionMessage`>(element, `index-updatedExtensionMessage`::class.java)
          "enhanced-context" -> context.deserialize<`enhanced-contextExtensionMessage`>(element, `enhanced-contextExtensionMessage`::class.java)
          "attribution" -> context.deserialize<AttributionExtensionMessage>(element, AttributionExtensionMessage::class.java)
          "setChatEnabledConfigFeature" -> context.deserialize<SetChatEnabledConfigFeatureExtensionMessage>(element, SetChatEnabledConfigFeatureExtensionMessage::class.java)
          "context/remote-repos" -> context.deserialize<`context_remote-reposExtensionMessage`>(element, `context_remote-reposExtensionMessage`::class.java)
          "setConfigFeatures" -> context.deserialize<SetConfigFeaturesExtensionMessage>(element, SetConfigFeaturesExtensionMessage::class.java)
          "allMentionProvidersMetadata" -> context.deserialize<AllMentionProvidersMetadataExtensionMessage>(element, AllMentionProvidersMetadataExtensionMessage::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ConfigExtensionMessage(
  val type: TypeEnum, // Oneof: config
  val config: ConfigParams,
  val authStatus: AuthStatus,
  val workspaceFolderUris: List<String>,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("config") Config,
  }
}

data class Search_configExtensionMessage(
  val type: TypeEnum, // Oneof: search:config
  val workspaceFolderUris: List<String>,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("search:config") Search_config,
  }
}

data class HistoryExtensionMessage(
  val type: TypeEnum, // Oneof: history
  val localHistory: UserLocalHistory? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("history") History,
  }
}

data class TranscriptExtensionMessage(
  val type: TypeEnum, // Oneof: transcript
  val messages: List<SerializedChatMessage>,
  val isMessageInProgress: Boolean,
  val chatID: String,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("transcript") Transcript,
  }
}

data class ViewExtensionMessage(
  val type: TypeEnum, // Oneof: view
  val view: View, // Oneof: chat, login
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("view") View,
  }
}

data class ErrorsExtensionMessage(
  val type: TypeEnum, // Oneof: errors
  val errors: String,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("errors") Errors,
  }
}

data class NoticeExtensionMessage(
  val type: TypeEnum, // Oneof: notice
  val notice: NoticeParams,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("notice") Notice,
  }
}

data class `transcript-errorsExtensionMessage`(
  val type: TypeEnum, // Oneof: transcript-errors
  val isTranscriptError: Boolean,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("transcript-errors") `Transcript-errors`,
  }
}

data class UserContextFilesExtensionMessage(
  val type: TypeEnum, // Oneof: userContextFiles
  val userContextFiles: List<ContextItem>? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("userContextFiles") UserContextFiles,
  }
}

data class ClientStateExtensionMessage(
  val type: TypeEnum, // Oneof: clientState
  val value: ClientStateForWebview,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("clientState") ClientState,
  }
}

data class ClientActionExtensionMessage(
  val type: TypeEnum, // Oneof: clientAction
  val addContextItemsToLastHumanInput: List<ContextItem>,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("clientAction") ClientAction,
  }
}

data class ChatModelsExtensionMessage(
  val type: TypeEnum, // Oneof: chatModels
  val models: List<ModelProvider>,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("chatModels") ChatModels,
  }
}

data class `update-search-resultsExtensionMessage`(
  val type: TypeEnum, // Oneof: update-search-results
  val results: List<SearchPanelFile>,
  val query: String,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("update-search-results") `Update-search-results`,
  }
}

data class `index-updatedExtensionMessage`(
  val type: TypeEnum, // Oneof: index-updated
  val scopeDir: String,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("index-updated") `Index-updated`,
  }
}

data class `enhanced-contextExtensionMessage`(
  val type: TypeEnum, // Oneof: enhanced-context
  val enhancedContextStatus: EnhancedContextContextT,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("enhanced-context") `Enhanced-context`,
  }
}

data class AttributionExtensionMessage(
  val type: TypeEnum, // Oneof: attribution
  val snippet: String,
  val attribution: AttributionParams? = null,
  val error: String? = null,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("attribution") Attribution,
  }
}

data class SetChatEnabledConfigFeatureExtensionMessage(
  val type: TypeEnum, // Oneof: setChatEnabledConfigFeature
  val data: Boolean,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("setChatEnabledConfigFeature") SetChatEnabledConfigFeature,
  }
}

data class `context_remote-reposExtensionMessage`(
  val type: TypeEnum, // Oneof: context/remote-repos
  val repos: List<Repo>,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("context/remote-repos") `Context_remote-repos`,
  }
}

data class SetConfigFeaturesExtensionMessage(
  val type: TypeEnum, // Oneof: setConfigFeatures
  val configFeatures: ConfigFeaturesParams,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("setConfigFeatures") SetConfigFeatures,
  }
}

data class AllMentionProvidersMetadataExtensionMessage(
  val type: TypeEnum, // Oneof: allMentionProvidersMetadata
  val providers: List<ContextMentionProviderMetadata>,
) : ExtensionMessage() {

  enum class TypeEnum {
    @SerializedName("allMentionProvidersMetadata") AllMentionProvidersMetadata,
  }
}

