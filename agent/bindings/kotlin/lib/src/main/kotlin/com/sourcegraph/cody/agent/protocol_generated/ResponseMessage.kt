@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ResponseMessage(
  val streamId: String? = null,
  val streamEvent: StreamEventEnum? = null, // Oneof: next, error, complete
  val data: Any? = null,
) {

  enum class StreamEventEnum {
    @SerializedName("next") Next,
    @SerializedName("error") Error,
    @SerializedName("complete") Complete,
  }
}

