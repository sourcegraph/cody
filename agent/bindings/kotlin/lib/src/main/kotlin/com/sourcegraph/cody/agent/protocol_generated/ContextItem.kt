@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class ContextItem {
  companion object {
    val deserializer: JsonDeserializer<ContextItem> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "file" -> context.deserialize<ContextItemFile>(element, ContextItemFile::class.java)
          "repository" -> context.deserialize<ContextItemRepository>(element, ContextItemRepository::class.java)
          "tree" -> context.deserialize<ContextItemTree>(element, ContextItemTree::class.java)
          "symbol" -> context.deserialize<ContextItemSymbol>(element, ContextItemSymbol::class.java)
          "openctx" -> context.deserialize<ContextItemOpenCtx>(element, ContextItemOpenCtx::class.java)
          "open-link" -> context.deserialize<ContextItemOpenLink>(element, ContextItemOpenLink::class.java)
          "current-selection" -> context.deserialize<ContextItemCurrentSelection>(element, ContextItemCurrentSelection::class.java)
          "current-file" -> context.deserialize<ContextItemCurrentFile>(element, ContextItemCurrentFile::class.java)
          "current-repository" -> context.deserialize<ContextItemCurrentRepository>(element, ContextItemCurrentRepository::class.java)
          "current-directory" -> context.deserialize<ContextItemCurrentDirectory>(element, ContextItemCurrentDirectory::class.java)
          "current-open-tabs" -> context.deserialize<ContextItemCurrentOpenTabs>(element, ContextItemCurrentOpenTabs::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ContextItemFile(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: file
  val remoteRepositoryName: String? = null,
  val ranges: List<Range>? = null,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("file") File,
  }
}

data class ContextItemRepository(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: repository
  val repoID: String,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("repository") Repository,
  }
}

data class ContextItemTree(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: tree
  val isWorkspaceRoot: Boolean,
  val name: String,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("tree") Tree,
  }
}

data class ContextItemSymbol(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: symbol
  val symbolName: String,
  val kind: SymbolKind, // Oneof: class, function, method
  val remoteRepositoryName: String? = null,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("symbol") Symbol,
  }
}

data class ContextItemOpenCtx(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: openctx
  val providerUri: String,
  val mention: MentionParams? = null,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("openctx") Openctx,
  }
}

data class ContextItemOpenLink(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: open-link
  val name: String,
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("open-link") `Open-link`,
  }
}

data class ContextItemCurrentSelection(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: current-selection
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("current-selection") `Current-selection`,
  }
}

data class ContextItemCurrentFile(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: current-file
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("current-file") `Current-file`,
  }
}

data class ContextItemCurrentRepository(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: current-repository
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("current-repository") `Current-repository`,
  }
}

data class ContextItemCurrentDirectory(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: current-directory
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("current-directory") `Current-directory`,
  }
}

data class ContextItemCurrentOpenTabs(
  val uri: String,
  val range: RangeData? = null,
  val content: String? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val title: String? = null,
  val description: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val badge: String? = null,
  val type: TypeEnum, // Oneof: current-open-tabs
) : ContextItem() {

  enum class TypeEnum {
    @SerializedName("current-open-tabs") `Current-open-tabs`,
  }
}

