package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.config.notification.AccountSettingChangeActionNotifier
import com.sourcegraph.cody.config.notification.AccountSettingChangeContext
import com.sourcegraph.config.ConfigUtil

class CodyPersistentAccountsHost(private val project: Project?) : CodyAccountsHost {
  override fun addAccount(
      server: SourcegraphServerPath,
      login: String,
      displayName: String?,
      token: String,
      id: String
  ) {
    val codyAccount = CodyAccount.create(login, displayName, server, id)
    CodyAuthenticationManager.instance.updateAccountToken(codyAccount, token)
    if (project != null) {
      CodyAuthenticationManager.instance.setActiveAccount(project, codyAccount)
      // Notify Cody Agent about config changes.
      CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
        agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
      }

      val bus = project.messageBus
      val publisher = bus.syncPublisher(AccountSettingChangeActionNotifier.TOPIC)
      publisher.afterAction(
          AccountSettingChangeContext(serverUrlChanged = true, accessTokenChanged = true))
    }
  }

  override fun isAccountUnique(login: String, server: SourcegraphServerPath): Boolean {
    return CodyAuthenticationManager.instance.isAccountUnique(login, server)
  }
}
