@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class CompletionItemInfo(
  val parseErrorCount: Int? = null,
  val lineTruncatedCount: Int? = null,
  val truncatedWith: TruncatedWithEnum? = null, // Oneof: tree-sitter, indentation
  val nodeTypes: NodeTypesParams? = null,
  val nodeTypesWithCompletion: NodeTypesWithCompletionParams? = null,
  val lineCount: Int? = null,
  val charCount: Int? = null,
  val insertText: String? = null,
  val stopReason: String? = null,
) {

  enum class TruncatedWithEnum {
    @SerializedName("tree-sitter") `Tree-sitter`,
    @SerializedName("indentation") Indentation,
  }
}

