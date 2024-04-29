package com.sourcegraph.cody.agent.protocol

import com.google.gson.annotations.SerializedName

enum class CodyTaskState {
  @SerializedName("Idle") Idle,
  @SerializedName("Working") Working,
  @SerializedName("Inserting") Inserting,
  @SerializedName("Applying") Applying,
  @SerializedName("Formatting") Formatting,
  @SerializedName("Applied") Applied,
  @SerializedName("Finished") Finished,
  @SerializedName("Error") Error,
  @SerializedName("Pending") Pending
}
