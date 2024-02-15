@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CurrentUserCodySubscription(
  var status: String? = null,
  var plan: String? = null,
  var applyProRateLimits: Boolean? = null,
  var currentPeriodStartAt: Date? = null,
  var currentPeriodEndAt: Date? = null,
)

