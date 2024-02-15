@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ChatError(
  val kind: String? = null,
  val name: String? = null,
  val message: String? = null,
  val retryAfter: String? = null,
  val limit: Int? = null,
  val userMessage: String? = null,
  val retryAfterDate: Date? = null,
  val retryAfterDateString: String? = null,
  val retryMessage: String? = null,
  val feature: String? = null,
  val upgradeIsAvailable: Boolean? = null,
  val isChatErrorGuard: IsChatErrorGuardEnum? = null, // Oneof: isChatErrorGuard
) {

  enum class IsChatErrorGuardEnum {
    @SerializedName("isChatErrorGuard") IsChatErrorGuard,
  }
}

