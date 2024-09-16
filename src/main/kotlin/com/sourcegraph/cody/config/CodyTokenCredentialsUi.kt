package com.sourcegraph.cody.config

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.ui.setEmptyState
import com.intellij.ui.components.JBTextField
import com.intellij.ui.components.fields.ExtendableTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.MAX_LINE_LENGTH_NO_WRAP
import com.intellij.ui.dsl.builder.Panel
import com.sourcegraph.cody.api.SourcegraphApiRequestExecutor
import com.sourcegraph.cody.api.SourcegraphApiRequests
import com.sourcegraph.cody.api.SourcegraphAuthenticationException
import com.sourcegraph.cody.auth.SsoAuthMethod
import com.sourcegraph.cody.config.DialogValidationUtils.custom
import com.sourcegraph.cody.config.DialogValidationUtils.notBlank
import com.sourcegraph.common.AuthorizationUtil
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.net.UnknownHostException
import javax.swing.JComponent
import javax.swing.JTextField

internal class CodyTokenCredentialsUi(
    private val serverTextField: ExtendableTextField,
    val factory: SourcegraphApiRequestExecutor.Factory
) : CodyCredentialsUi() {

  lateinit var customRequestHeadersField: ExtendableTextField
  private val tokenTextField = JBTextField()
  private var fixedLogin: String? = null

  fun setToken(token: String) {
    tokenTextField.text = token
  }

  override fun Panel.centerPanel() {
    row(CodyBundle.getString("login.dialog.instance-url.label")) {
      cell(serverTextField).align(AlignX.FILL)
    }
    row(CodyBundle.getString("login.dialog.token.label")) {
      cell(tokenTextField).align(AlignX.FILL)
    }
    group(CodyBundle.getString("login.dialog.optional.group"), indent = false) {
      row(CodyBundle.getString("login.dialog.custom-headers.label")) {
        customRequestHeadersField = ExtendableTextField("", 0)
        cell(customRequestHeadersField)
            .align(AlignX.FILL)
            .comment(
                CodyBundle.getString("login.dialog.custom-headers.comment").trimMargin(),
                MAX_LINE_LENGTH_NO_WRAP)
            .applyToComponent {
              this.setEmptyState(CodyBundle.getString("login.dialog.custom-headers.empty"))
            }
      }
    }
  }

  override fun getPreferredFocusableComponent(): JComponent = tokenTextField

  override fun getValidationInfo() =
      getServerPathValidationInfo()
          ?: notBlank(tokenTextField, CodyBundle.getString("login.dialog.validation.empty-token"))
          ?: custom(tokenTextField, CodyBundle.getString("login.dialog.validation.invalid-token")) {
            AuthorizationUtil.isValidAccessToken(tokenTextField.text)
          }

  fun getServerPathValidationInfo(): ValidationInfo? {
    return notBlank(
        serverTextField, CodyBundle.getString("login.dialog.validation.empty-instance-url"))
        ?: validateServerPath(serverTextField)
  }

  private fun validateServerPath(field: JTextField): ValidationInfo? =
      if (!isServerPathValid(field.text)) {
        ValidationInfo(CodyBundle.getString("login.dialog.validation.invalid-instance-url"), field)
      } else {
        null
      }

  private fun isServerPathValid(text: String): Boolean {
    return runCatching { SourcegraphServerPath.from(text, "") }.getOrNull() != null
  }

  override fun createExecutor(server: SourcegraphServerPath): SourcegraphApiRequestExecutor {
    return factory.create(server, tokenTextField.text)
  }

  override fun acquireDetailsAndToken(
      executor: SourcegraphApiRequestExecutor,
      indicator: ProgressIndicator,
      authMethod: SsoAuthMethod
  ): Pair<CodyAccountDetails, String> {
    val details = acquireDetails(executor, indicator, fixedLogin)
    return details to tokenTextField.text
  }

  override fun handleAcquireError(error: Throwable): ValidationInfo =
      when (error) {
        is SourcegraphParseException ->
            ValidationInfo(
                error.message
                    ?: CodyBundle.getString("login.dialog.validation.invalid-instance-url"),
                serverTextField)
        else -> handleError(error)
      }

  override fun setBusy(busy: Boolean) {
    tokenTextField.isEnabled = !busy
  }

  fun setFixedLogin(fixedLogin: String?) {
    this.fixedLogin = fixedLogin
  }

  companion object {

    fun acquireDetails(
        executor: SourcegraphApiRequestExecutor,
        indicator: ProgressIndicator,
        fixedLogin: String?
    ): CodyAccountDetails {
      val accountDetails = SourcegraphApiRequests.CurrentUser(executor, indicator).getDetails()

      val login = accountDetails.username
      if (fixedLogin != null && fixedLogin != login)
          throw SourcegraphAuthenticationException("Token should match username \"$fixedLogin\".")

      return accountDetails
    }

    fun handleError(error: Throwable): ValidationInfo =
        when (error) {
          is UnknownHostException ->
              ValidationInfo(CodyBundle.getString("login.dialog.error.server-unreachable"))
                  .withOKEnabled()
          is SourcegraphAuthenticationException ->
              ValidationInfo(
                      CodyBundle.getString("login.dialog.error.incorrect-credentials")
                          .fmt(error.message.orEmpty()))
                  .withOKEnabled()
          else ->
              ValidationInfo(
                      CodyBundle.getString("login.dialog.error.invalid-authentication")
                          .fmt(error.message.orEmpty()))
                  .withOKEnabled()
        }
  }
}
