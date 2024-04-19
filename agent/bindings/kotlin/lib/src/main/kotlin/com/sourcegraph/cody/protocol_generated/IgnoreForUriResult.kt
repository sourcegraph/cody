@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class IgnoreForUriResult(
  val policy: PolicyEnum? = null, // Oneof: ignore, use
) {

  enum class PolicyEnum {
    @SerializedName("ignore") Ignore,
    @SerializedName("use") Use,
  }
}

