@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class EventProperties(
  val anonymousUserID: String? = null,
  val prefix: String? = null,
  val client: String? = null,
  val source: SourceEnum? = null, // Oneof: IDEEXTENSION
) {

  enum class SourceEnum {
    @SerializedName("IDEEXTENSION") IDEEXTENSION,
  }
}

