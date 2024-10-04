package com.sourcegraph.cody.agent.protocol

enum class BillingProduct {
  CODY
}

enum class BillingCategory {
  CORE,
  BILLABLE
}

data class BillingMetadata(val product: BillingProduct, val category: BillingCategory)

data class TelemetryEventParameters(
    val version: Long? = null,
    val interactionID: String? = null,
    val metadata: Map<String, Long>? = null,
    val billingMetadata: BillingMetadata? = null,
    val privateMetadata: Map<String, String>? = null,
)
