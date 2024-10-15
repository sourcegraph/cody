@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class SerializedContextItem(
  val uri: String,
  val title: String? = null,
  val source: ContextItemSource? = null, // Oneof: user, editor, search, initial, priority, unified, selection, terminal, history, agentic
  val range: RangeData? = null,
  val repoName: String? = null,
  val revision: String? = null,
  val description: String? = null,
  val size: Long? = null,
  val isIgnored: Boolean? = null,
  val isTooLarge: Boolean? = null,
  val isTooLargeReason: String? = null,
  val provider: String? = null,
  val icon: String? = null,
  val metadata: List<String>? = null,
  val type: TypeEnum, // Oneof: repository, tree, symbol, openctx, file
  val remoteRepositoryName: String? = null,
  val ranges: List<Range>? = null,
  val repoID: String,
  val isWorkspaceRoot: Boolean,
  val name: String,
  val symbolName: String,
  val kind: SymbolKind, // Oneof: class, function, method
  val providerUri: String,
  val mention: MentionParams? = null,
) {

  enum class TypeEnum {
    @SerializedName("repository") Repository,
    @SerializedName("tree") Tree,
    @SerializedName("symbol") Symbol,
    @SerializedName("openctx") Openctx,
    @SerializedName("file") File,
  }
}

