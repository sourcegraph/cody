package com.sourcegraph.cody.auth

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.config.getFirstAccountOrNull
import com.sourcegraph.cody.initialization.Activity

class SelectOneOfTheAccountsAsActive : Activity {

  override fun runActivity(project: Project) {
    if (CodyAuthenticationManager.instance.hasNoActiveAccount(project)) {
      val newActiveAccount =
          CodyAuthenticationManager.instance.getAccounts().getFirstAccountOrNull()
      CodyAuthenticationManager.instance.setActiveAccount(project, newActiveAccount)
      ApplicationManager.getApplication().invokeLater {
        CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshPanelsVisibility() }
      }
    }
  }
}
