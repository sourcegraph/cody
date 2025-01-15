@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class CodyContextFilterItem(
  val repoNamePattern: RepoNamePatternEnum, // Oneof: .*
  val filePathPatterns: List<String>? = null,
) {

  enum class RepoNamePatternEnum {
    @SerializedName(".*") ``,
  }
}

