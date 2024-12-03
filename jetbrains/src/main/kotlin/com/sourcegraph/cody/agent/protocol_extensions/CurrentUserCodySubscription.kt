package com.sourcegraph.cody.agent.protocol_extensions

import com.sourcegraph.cody.agent.protocol_generated.CurrentUserCodySubscription

fun CurrentUserCodySubscription.isProPlan(): Boolean {
  return plan == "PRO"
}

fun CurrentUserCodySubscription.isPendingStatus(): Boolean {
  return status == "PENDING"
}
