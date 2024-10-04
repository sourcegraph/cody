package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.protocol.BillingCategory
import com.sourcegraph.cody.agent.protocol.BillingMetadata
import com.sourcegraph.cody.agent.protocol.BillingProduct
import com.sourcegraph.cody.agent.protocol.TelemetryEventParameters
import com.sourcegraph.cody.telemetry.TelemetryV2

class CodyPersistentAccountsHost(private val project: Project) : CodyAccountsHost {
  override fun addAccount(
      server: SourcegraphServerPath,
      login: String,
      displayName: String?,
      token: String,
      id: String
  ) {
    TelemetryV2.sendTelemetryEvent(
        project,
        "auth.signin.token",
        "clicked",
        TelemetryEventParameters(
            billingMetadata = BillingMetadata(BillingProduct.CODY, BillingCategory.BILLABLE)))

    val codyAccount = CodyAccount(login, displayName, server, id)
    val authManager = CodyAuthenticationManager.getInstance()
    authManager.updateAccountToken(codyAccount, token)
    authManager.setActiveAccount(codyAccount)
  }
}
