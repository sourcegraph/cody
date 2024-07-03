package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.telemetry.TelemetryV2

class CodyPersistentAccountsHost(private val project: Project) : CodyAccountsHost {
  override fun addAccount(
      server: SourcegraphServerPath,
      login: String,
      displayName: String?,
      token: String,
      id: String
  ) {
    TelemetryV2.sendTelemetryEvent(project, "auth.signin.token", "clicked")

    val codyAccount = CodyAccount(login, displayName, server, id)
    val authManager = CodyAuthenticationManager.getInstance(project)
    authManager.updateAccountToken(codyAccount, token)
    authManager.setActiveAccount(codyAccount)
  }
}
