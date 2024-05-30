@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ContextMentionProviderMetadata(
  val id: IdEnum, // Oneof: symbol
  val title: TitleEnum, // Oneof: Symbols
  val queryLabel: QueryLabelEnum, // Oneof: Search for a symbol to include...
  val emptyLabel: String? = null,
) {

  enum class IdEnum {
    @SerializedName("symbol") Symbol,
  }

  enum class TitleEnum {
    @SerializedName("Symbols") Symbols,
  }

  enum class QueryLabelEnum {
    @SerializedName("Search for a symbol to include...") `Search for a symbol to include...`,
  }
}

