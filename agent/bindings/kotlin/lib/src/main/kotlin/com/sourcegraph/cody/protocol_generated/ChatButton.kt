@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ChatButton(
  val label: String? = null,
  val action: String? = null,
  val appearance: AppearanceEnum? = null, // Oneof: primary, secondary, icon
) {

  enum class AppearanceEnum {
    @SerializedName("primary") Primary,
    @SerializedName("secondary") Secondary,
    @SerializedName("icon") Icon,
  }
}

