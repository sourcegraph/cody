@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ModelRef(
  val providerId: String,
  val apiVersionId: ApiVersionIdEnum, // Oneof: unknown
  val modelId: String,
) {

  enum class ApiVersionIdEnum {
    @SerializedName("unknown") Unknown,
  }
}

