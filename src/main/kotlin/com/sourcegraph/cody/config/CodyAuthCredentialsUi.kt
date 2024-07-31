package com.sourcegraph.cody.config

import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.ProgressIndicatorUtils
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.components.JBLabel
import com.intellij.ui.dsl.builder.Panel
import com.intellij.util.ui.UIUtil.getInactiveTextColor
import com.sourcegraph.cody.api.SourcegraphApiRequestExecutor
import com.sourcegraph.cody.auth.SourcegraphAuthService
import com.sourcegraph.cody.auth.SsoAuthMethod
import com.sourcegraph.common.CodyBundle
import javax.swing.JComponent

class CodyAuthCredentialsUi(val factory: SourcegraphApiRequestExecutor.Factory) :
    CodyCredentialsUi() {

  override fun getPreferredFocusableComponent(): JComponent? = null

  override fun getValidationInfo(): ValidationInfo? = null

  override fun createExecutor(server: SourcegraphServerPath): SourcegraphApiRequestExecutor =
      factory.create(server, "")

  override fun acquireDetailsAndToken(
      executor: SourcegraphApiRequestExecutor,
      indicator: ProgressIndicator,
      authMethod: SsoAuthMethod
  ): Pair<CodyAccountDetails, String> {
    val token = acquireToken(indicator, executor.server.url, authMethod)
    // The token has changed, so create a new executor to talk to the same server with the new
    // token.
    val newExecutor = factory.create(executor.server, token)
    val details = CodyTokenCredentialsUi.acquireDetails(newExecutor, indicator, null)
    return details to token
  }

  override fun handleAcquireError(error: Throwable): ValidationInfo =
      CodyTokenCredentialsUi.handleError(error)

  override fun setBusy(busy: Boolean) = Unit

  override fun Panel.centerPanel() {
    row {
      cell(
          JBLabel(CodyBundle.getString("login.dialog.check-browser")).apply {
            icon = AnimatedIcon.Default.INSTANCE
            foreground = getInactiveTextColor()
          })
    }
  }

  private fun acquireToken(
      indicator: ProgressIndicator,
      server: String,
      authMethod: SsoAuthMethod
  ): String {
    val credentialsFuture = SourcegraphAuthService.instance.authorize(server, authMethod)
    try {
      return ProgressIndicatorUtils.awaitWithCheckCanceled(credentialsFuture, indicator)
    } catch (pce: ProcessCanceledException) {
      credentialsFuture.completeExceptionally(pce)
      throw pce
    }
  }
}
