package com.sourcegraph.cody.agent.protocol_extensions

object BillingMetadata {
  object Product {
    const val CODY = "cody"
  }

  object Category {
    const val CORE = "core"
    const val BILLABLE = "billable"
  }
}
