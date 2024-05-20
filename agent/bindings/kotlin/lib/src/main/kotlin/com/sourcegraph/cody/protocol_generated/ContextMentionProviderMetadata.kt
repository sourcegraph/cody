@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ContextMentionProviderMetadata(
  val id: IdEnum, // Oneof: file
  val title: TitleEnum, // Oneof: Files
  val queryLabel: QueryLabelEnum, // Oneof: Search for a file to include...
  val emptyLabel: EmptyLabelEnum, // Oneof: No files found
) {

  enum class IdEnum {
    @SerializedName("file") File,
  }

  enum class TitleEnum {
    @SerializedName("Files") Files,
  }

  enum class QueryLabelEnum {
    @SerializedName("Search for a file to include...") `Search for a file to include...`,
  }

  enum class EmptyLabelEnum {
    @SerializedName("No files found") `No files found`,
  }
}

