@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ShowWindowMessageParams(
  val severity: SeverityEnum? = null, // Oneof: error, warning, information
  val message: String? = null,
  val options: MessageOptions? = null,
  val items: List<String>? = null,
) {

  enum class SeverityEnum {
    @SerializedName("error") Error,
    @SerializedName("warning") Warning,
    @SerializedName("information") Information,
  }
}

