package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project

class CodyPersistentAccountsHost(private val project: Project) : CodyAccountsHost {
  override fun addAccount(
      server: SourcegraphServerPath,
      login: String,
      displayName: String?,
      token: String,
      id: String
  ) {
    val codyAccount = CodyAccount(login, displayName, server, id)
    val authManager = CodyAuthenticationManager.getInstance(project)
    authManager.updateAccountToken(codyAccount, token)
    authManager.setActiveAccount(codyAccount)
  }
}
