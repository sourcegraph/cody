package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol_generated.FeatureFlags_GetFeatureFlagParams

object GetFeatureFlag {
  val UseSscForCodySubscription = FeatureFlags_GetFeatureFlagParams("UseSscForCodySubscription")
  val CodyProTrialEnded = FeatureFlags_GetFeatureFlagParams("CodyProTrialEnded")
}
