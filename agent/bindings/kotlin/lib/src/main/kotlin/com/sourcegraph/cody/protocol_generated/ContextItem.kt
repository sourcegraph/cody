@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import java.lang.reflect.Type

sealed class ContextItem {
  companion object {
    val deserializer: JsonDeserializer<ContextItem> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.asJsonObject.get("type").asString) {
          "file" -> context.deserialize<ContextItemFile>(element, ContextItemFile::class.java)
          "symbol" -> context.deserialize<ContextItemSymbol>(element, ContextItemSymbol::class.java)
          "package" -> context.deserialize<ContextItemPackage>(element, ContextItemPackage::class.java)
          "github_pull_request" -> context.deserialize<ContextItemGithubPullRequest>(element, ContextItemGithubPullRequest::class.java)
          "github_issue" -> context.deserialize<ContextItemGithubIssue>(element, ContextItemGithubIssue::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ContextItemFile(
  val uri: Uri,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextItemSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal, uri, package, history, github
  val size: Int? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val provider: String? = null,
  val type: TypeEnum, // Oneof: file
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("file") File,
  }
}

data class ContextItemSymbol(
  val uri: Uri,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextItemSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal, uri, package, history, github
  val size: Int? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val provider: String? = null,
  val type: TypeEnum, // Oneof: symbol
  val symbolName: String,
  val kind: SymbolKind, // Oneof: class, function, method
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("symbol") Symbol,
  }
}

data class ContextItemPackage(
  val uri: Uri,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextItemSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal, uri, package, history, github
  val size: Int? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val provider: String? = null,
  val type: TypeEnum, // Oneof: package
  val repoID: String,
  val ecosystem: String,
  val name: String,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("package") Package,
  }
}

data class ContextItemGithubPullRequest(
  val uri: Uri,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextItemSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal, uri, package, history, github
  val size: Int? = null,
  val isTooLarge: Boolean? = null,
  val provider: String? = null,
  val type: TypeEnum, // Oneof: github_pull_request
  val owner: String,
  val pullNumber: Int,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("github_pull_request") Github_pull_request,
  }
}

data class ContextItemGithubIssue(
  val uri: Uri,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val source: ContextItemSource? = null, // Oneof: embeddings, user, keyword, editor, filename, search, unified, selection, terminal, uri, package, history, github
  val size: Int? = null,
  val isTooLarge: Boolean? = null,
  val provider: String? = null,
  val type: TypeEnum, // Oneof: github_issue
  val owner: String,
  val issueNumber: Int,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("github_issue") Github_issue,
  }
}

