@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class Ignore_TestResult(
  val policy: PolicyEnum, // Oneof: ignore, use
) {

  enum class PolicyEnum {
    @SerializedName("ignore") Ignore,
    @SerializedName("use") Use,
  }
}

