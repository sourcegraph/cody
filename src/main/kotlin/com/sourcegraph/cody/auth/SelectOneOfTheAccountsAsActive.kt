package com.sourcegraph.cody.auth

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.config.CodyProjectActiveAccountHolder
import com.sourcegraph.cody.config.getFirstAccountOrNull
import com.sourcegraph.cody.initialization.Activity

class SelectOneOfTheAccountsAsActive : Activity {

  override fun runActivity(project: Project) {
    // It is possible that CodyProjectActiveAccountHolder loads the account from the state omitting
    // setActiveAccount() call. We need the call to happen as it propagates the configuration
    // changes to the agent and the account settings changes to the UI.
    val initialAccount =
        CodyProjectActiveAccountHolder.getInstance(project).account
            ?: CodyAuthenticationManager.getInstance(project).getAccounts().getFirstAccountOrNull()
    if (initialAccount == null) {
      // The call to refreshPanelsVisibility() is needed to update the UI when there is no account.
      CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshPanelsVisibility() }
    } else {
      CodyAuthenticationManager.getInstance(project).setActiveAccount(initialAccount)
    }
  }
}
