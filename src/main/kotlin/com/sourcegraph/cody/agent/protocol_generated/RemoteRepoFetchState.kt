@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class RemoteRepoFetchState(
  val state: StateEnum, // Oneof: paused, fetching, errored, complete
  val error: CodyError? = null,
) {

  enum class StateEnum {
    @SerializedName("paused") Paused,
    @SerializedName("fetching") Fetching,
    @SerializedName("errored") Errored,
    @SerializedName("complete") Complete,
  }
}

