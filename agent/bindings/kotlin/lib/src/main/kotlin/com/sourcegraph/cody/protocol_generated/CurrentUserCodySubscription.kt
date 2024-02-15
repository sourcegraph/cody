@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CurrentUserCodySubscription(
  val status: String? = null,
  val plan: String? = null,
  val applyProRateLimits: Boolean? = null,
  val currentPeriodStartAt: Date? = null,
  val currentPeriodEndAt: Date? = null,
)

