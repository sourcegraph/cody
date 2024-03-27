package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.auth.SsoAuthMethod
import git4idea.DialogManager
import java.awt.Component

internal class CodyLoginRequest(
    val title: String? = null,
    val server: SourcegraphServerPath? = null,
    val login: String? = null,
    val isCheckLoginUnique: Boolean = false,
    val token: String? = null,
    val customRequestHeaders: String? = null,
    val loginButtonText: String? = null
)

internal fun CodyLoginRequest.loginWithToken(
    project: Project,
    parentComponent: Component?
): CodyAuthData? {
  val isLoginUniqueChecker: UniqueLoginPredicate = { login, server ->
    !isCheckLoginUnique ||
        CodyAuthenticationManager.getInstance(project).isAccountUnique(login, server)
  }
  val dialog =
      SourcegraphTokenLoginDialog(
          project, parentComponent, isLoginUniqueChecker, SsoAuthMethod.DEFAULT)
  configure(dialog)

  return dialog.getAuthData()
}

private fun CodyLoginRequest.configure(dialog: BaseLoginDialog) {
  server?.let { dialog.setServer(it.toString()) }
  login?.let { dialog.setLogin(it) }
  token?.let { dialog.setToken(it) }
  customRequestHeaders?.let { dialog.setCustomRequestHeaders(it) }
  title?.let { dialog.title = it }
  loginButtonText?.let { dialog.setLoginButtonText(it) }
}

private fun BaseLoginDialog.getAuthData(): CodyAuthData? {
  DialogManager.show(this)
  return if (isOK) CodyAuthData(CodyAccount.create(login, displayName, server), login, token)
  else null
}
