@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ProcessingStep(
  val type: ProcessType, // Oneof: confirmation, step
  val id: String,
  val title: String? = null,
  val content: String,
  val status: StatusEnum, // Oneof: pending, success, error
  val step: Long? = null,
  val error: ChatError? = null,
) {

  enum class StatusEnum {
    @SerializedName("pending") Pending,
    @SerializedName("success") Success,
    @SerializedName("error") Error,
  }
}

