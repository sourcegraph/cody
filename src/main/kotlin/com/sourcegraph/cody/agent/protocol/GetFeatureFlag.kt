package com.sourcegraph.cody.agent.protocol

data class GetFeatureFlag(val flagName: String) {
  companion object {
    val UseSscForCodySubscription = GetFeatureFlag("UseSscForCodySubscription")
    val CodyProTrialEnded = GetFeatureFlag("CodyProTrialEnded")
  }
}
