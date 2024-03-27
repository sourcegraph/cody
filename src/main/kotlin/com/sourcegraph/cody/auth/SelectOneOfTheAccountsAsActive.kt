package com.sourcegraph.cody.auth

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.config.getFirstAccountOrNull
import com.sourcegraph.cody.initialization.Activity

class SelectOneOfTheAccountsAsActive : Activity {

  override fun runActivity(project: Project) {
    if (CodyAuthenticationManager.getInstance(project).hasNoActiveAccount()) {
      val newActiveAccount =
          CodyAuthenticationManager.getInstance(project).getAccounts().getFirstAccountOrNull()
      CodyAuthenticationManager.getInstance(project).setActiveAccount(newActiveAccount)
      CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshPanelsVisibility() }
    }
  }
}
