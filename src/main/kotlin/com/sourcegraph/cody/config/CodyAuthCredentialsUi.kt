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
import javax.swing.JComponent

class CodyAuthCredentialsUi(
    val factory: SourcegraphApiRequestExecutor.Factory,
    val isAccountUnique: UniqueLoginPredicate
) : CodyCredentialsUi() {

  override fun getPreferredFocusableComponent(): JComponent? = null

  override fun getValidator(): Validator = { null }

  override fun createExecutor(server: SourcegraphServerPath): SourcegraphApiRequestExecutor =
      factory.create(server, "")

  override fun acquireDetailsAndToken(
      executor: SourcegraphApiRequestExecutor,
      indicator: ProgressIndicator,
      authMethod: SsoAuthMethod
  ): Pair<CodyAccountDetails, String> {
    val token = acquireToken(indicator, authMethod)
    // The token has changed, so create a new executor to talk to the same server with the new
    // token.
    val executor = factory.create(executor.server, token)
    val details = CodyTokenCredentialsUi.acquireDetails(executor, indicator, isAccountUnique, null)
    return details to token
  }

  override fun handleAcquireError(error: Throwable): ValidationInfo =
      CodyTokenCredentialsUi.handleError(error)

  override fun setBusy(busy: Boolean) = Unit

  override fun Panel.centerPanel() {
    row {
      val progressLabel =
          JBLabel("Logging in, check your browser").apply {
            icon = AnimatedIcon.Default()
            foreground = getInactiveTextColor()
          }
      cell(progressLabel)
    }
  }

  private fun acquireToken(indicator: ProgressIndicator, authMethod: SsoAuthMethod): String {
    val credentialsFuture = SourcegraphAuthService.instance.authorize(authMethod)
    try {
      return ProgressIndicatorUtils.awaitWithCheckCanceled(credentialsFuture, indicator)
    } catch (pce: ProcessCanceledException) {
      credentialsFuture.completeExceptionally(pce)
      throw pce
    }
  }
}
