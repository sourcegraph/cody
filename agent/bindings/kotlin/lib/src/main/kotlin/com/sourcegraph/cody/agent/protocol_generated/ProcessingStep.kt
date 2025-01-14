@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ProcessingStep(
  val type: ProcessType? = null, // Oneof: tool, confirmation
  val id: String,
  val title: String? = null,
  val description: String? = null,
  val content: String,
  val state: StateEnum, // Oneof: pending, success, error
  val error: ChatError? = null,
) {

  enum class StateEnum {
    @SerializedName("pending") Pending,
    @SerializedName("success") Success,
    @SerializedName("error") Error,
  }
}

