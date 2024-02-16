@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class ContextProvider {
  companion object {
    val deserializer: JsonDeserializer<ContextProvider> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("kind").asString) {
          "embeddings" -> context.deserialize<LocalEmbeddingsProvider>(element, LocalEmbeddingsProvider::class.java)
          "search" -> context.deserialize<LocalSearchProvider>(element, LocalSearchProvider::class.java)
          "search" -> context.deserialize<RemoteSearchProvider>(element, RemoteSearchProvider::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class LocalEmbeddingsProvider(
  val kind: KindEnum? = null, // Oneof: embeddings
  val state: StateEnum? = null, // Oneof: indeterminate, no-match, unconsented, indexing, ready
  val errorReason: ErrorReasonEnum? = null, // Oneof: not-a-git-repo, git-repo-has-no-remote
) : ContextProvider() {

  enum class KindEnum {
    @SerializedName("embeddings") Embeddings,
  }

  enum class StateEnum {
    @SerializedName("indeterminate") Indeterminate,
    @SerializedName("no-match") `No-match`,
    @SerializedName("unconsented") Unconsented,
    @SerializedName("indexing") Indexing,
    @SerializedName("ready") Ready,
  }

  enum class ErrorReasonEnum {
    @SerializedName("not-a-git-repo") `Not-a-git-repo`,
    @SerializedName("git-repo-has-no-remote") `Git-repo-has-no-remote`,
  }
}

data class LocalSearchProvider(
  val kind: KindEnum? = null, // Oneof: search
  val type: TypeEnum? = null, // Oneof: local
  val state: StateEnum? = null, // Oneof: unindexed, indexing, ready, failed
) : ContextProvider() {

  enum class KindEnum {
    @SerializedName("search") Search,
  }

  enum class TypeEnum {
    @SerializedName("local") Local,
  }

  enum class StateEnum {
    @SerializedName("unindexed") Unindexed,
    @SerializedName("indexing") Indexing,
    @SerializedName("ready") Ready,
    @SerializedName("failed") Failed,
  }
}

data class RemoteSearchProvider(
  val kind: KindEnum? = null, // Oneof: search
  val type: TypeEnum? = null, // Oneof: remote
  val state: StateEnum? = null, // Oneof: ready, no-match
  val id: String? = null,
  val inclusion: InclusionEnum? = null, // Oneof: auto, manual
) : ContextProvider() {

  enum class KindEnum {
    @SerializedName("search") Search,
  }

  enum class TypeEnum {
    @SerializedName("remote") Remote,
  }

  enum class StateEnum {
    @SerializedName("ready") Ready,
    @SerializedName("no-match") `No-match`,
  }

  enum class InclusionEnum {
    @SerializedName("auto") Auto,
    @SerializedName("manual") Manual,
  }
}

