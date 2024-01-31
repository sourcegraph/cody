package com.sourcegraph.cody.agent.protocol

import com.google.gson.annotations.SerializedName
import java.util.*

data class CurrentUserCodySubscription(
    val status: Status,
    val plan: Plan,
    val applyProRateLimits: Boolean,
    val currentPeriodStartAt: Date,
    val currentPeriodEndAt: Date,
)

enum class Plan {
  @SerializedName("PRO") PRO,
  @SerializedName("FREE") FREE
}

enum class Status {
  @SerializedName("ACTIVE") ACTIVE,
  @SerializedName("PAST_DUE") PAST_DUE,
  @SerializedName("UNPAID") UNPAID,
  @SerializedName("CANCELED") CANCELED,
  @SerializedName("TRIALING") TRIALING,
  @SerializedName("PENDING") PENDING,
  @SerializedName("OTHER") OTHER,
}
