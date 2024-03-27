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
    val codyAccount = CodyAccount.create(login, displayName, server, id)
    CodyAuthenticationManager.getInstance(project).updateAccountToken(codyAccount, token)
    CodyAuthenticationManager.getInstance(project).setActiveAccount(codyAccount)
  }

  override fun isAccountUnique(login: String, server: SourcegraphServerPath): Boolean {
    return CodyAuthenticationManager.getInstance(project).isAccountUnique(login, server)
  }
}
