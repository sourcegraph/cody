@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CurrentUserCodySubscription(
  val status: String,
  val plan: String,
  val applyProRateLimits: Boolean,
  val currentPeriodStartAt: Date,
  val currentPeriodEndAt: Date,
)

