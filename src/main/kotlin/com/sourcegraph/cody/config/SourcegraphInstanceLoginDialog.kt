package com.sourcegraph.cody.config

import com.intellij.collaboration.async.CompletableFutureUtil
import com.intellij.collaboration.async.CompletableFutureUtil.errorOnEdt
import com.intellij.collaboration.async.CompletableFutureUtil.submitIOTask
import com.intellij.collaboration.async.CompletableFutureUtil.successOnEdt
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.components.service
import com.intellij.openapi.observable.util.whenTextChanged
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.util.ProgressIndicatorUtils
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.ui.setEmptyState
import com.intellij.openapi.util.Disposer
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.components.fields.ExtendableTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.MAX_LINE_LENGTH_NO_WRAP
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.layout.not
import com.intellij.ui.layout.selected
import com.intellij.util.ui.UIUtil.getInactiveTextColor
import com.sourcegraph.cody.api.SourcegraphApiRequestExecutor
import com.sourcegraph.cody.api.SourcegraphAuthenticationException
import com.sourcegraph.cody.auth.SourcegraphAuthService
import com.sourcegraph.cody.auth.SsoAuthMethod
import com.sourcegraph.cody.config.DialogValidationUtils.custom
import com.sourcegraph.cody.config.DialogValidationUtils.notBlank
import com.sourcegraph.common.AuthorizationUtil
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.awt.Component
import java.awt.event.ActionEvent
import java.net.UnknownHostException
import java.util.concurrent.CompletableFuture
import javax.swing.Action
import javax.swing.JCheckBox

class SourcegraphInstanceLoginDialog(
    project: Project?,
    parent: Component?,
    private val defaultInstanceUrl: String = ""
) : DialogWrapper(project, parent, false, IdeModalityType.PROJECT) {

  private var tokenAcquisitionError: ValidationInfo? = null
  private lateinit var instanceUrlField: JBTextField
  private lateinit var tokenField: JBTextField
  private lateinit var customRequestHeadersField: ExtendableTextField
  internal lateinit var codyAuthData: CodyAuthData

  private val advancedAction =
      object : DialogWrapperAction(CodyBundle.getString("login.dialog.show-advanced")) {
        override fun doAction(e: ActionEvent) {
          advancedSettings.isSelected = advancedSettings.isSelected.not()
          if (advancedSettings.isSelected) {
            setOKButtonText(CodyBundle.getString("login.dialog.add-account"))
            putValue(NAME, CodyBundle.getString("login.dialog.hide-advanced"))
          } else {
            setOKButtonText(CodyBundle.getString("login.dialog.authorize-in-browser"))
            putValue(NAME, CodyBundle.getString("login.dialog.show-advanced"))
            tokenAcquisitionError = null
          }

          invokeLater { pack() }
        }
      }

  private val isAcquiringToken = JCheckBox().also { it.isSelected = false }
  private val advancedSettings = JCheckBox().also { it.isSelected = false }

  init {
    title = CodyBundle.getString("login.dialog.title")
    setOKButtonText(CodyBundle.getString("login.dialog.authorize-in-browser"))
    init()
  }

  override fun createCenterPanel() = panel {
    row {
          cell(
              JBLabel(CodyBundle.getString("login.dialog.check-browser")).apply {
                icon = AnimatedIcon.Default.INSTANCE
                foreground = getInactiveTextColor()
              })
        }
        .visibleIf(isAcquiringToken.selected)
    row(CodyBundle.getString("login.dialog.instance-url.label")) {
          textField()
              .applyToComponent {
                emptyText.text = CodyBundle.getString("login.dialog.instance-url.empty")
                instanceUrlField = this
                text = defaultInstanceUrl
              }
              .align(AlignX.FILL)
        }
        .rowComment(
            CodyBundle.getString("login.dialog.instance-url.comment"),
            maxLineLength = MAX_LINE_LENGTH_NO_WRAP)
        .visibleIf(isAcquiringToken.selected.not())
    row(CodyBundle.getString("login.dialog.token.label")) {
          textField()
              .applyToComponent {
                tokenField = this
                tokenField.document.whenTextChanged { tokenAcquisitionError = null }
              }
              .align(AlignX.FILL)
        }
        .visibleIf(advancedSettings.selected)
    group(CodyBundle.getString("login.dialog.optional.group"), indent = false) {
          row(CodyBundle.getString("login.dialog.custom-headers.label")) {
            cell(ExtendableTextField(/*columns =*/ 0))
                .align(AlignX.FILL)
                .comment(
                    CodyBundle.getString("login.dialog.custom-headers.comment"),
                    maxLineLength = MAX_LINE_LENGTH_NO_WRAP)
                .applyToComponent {
                  setEmptyState(CodyBundle.getString("login.dialog.custom-headers.empty"))
                  customRequestHeadersField = this
                }
          }
        }
        .visibleIf(advancedSettings.selected)
  }

  override fun createActions(): Array<Action> = arrayOf(cancelAction, advancedAction, okAction)

  override fun doOKAction() {
    if (advancedSettings.isSelected.not()) {
      isAcquiringToken.isSelected = true
    }
    okAction.isEnabled = false
    advancedAction.isEnabled = false

    val emptyProgressIndicator = EmptyProgressIndicator(ModalityState.defaultModalityState())
    Disposer.register(disposable) { emptyProgressIndicator.cancel() }
    val server = deriveServerPath()

    acquireDetailsAndToken(emptyProgressIndicator)
        .successOnEdt(ModalityState.nonModal()) { (details, token) ->
          codyAuthData =
              CodyAuthData(
                  CodyAccount(details.username, details.displayName, server, details.id),
                  details.username,
                  token)
          close(OK_EXIT_CODE, true)
        }
        .errorOnEdt(ModalityState.nonModal()) {
          if (advancedSettings.isSelected.not()) {
            isAcquiringToken.isSelected = false
          }
          okAction.isEnabled = true
          advancedAction.isEnabled = true
          if (!CompletableFutureUtil.isCancellation(it)) startTrackingValidation()
        }
  }

  override fun getPreferredFocusedComponent() = instanceUrlField

  override fun doValidateAll(): MutableList<ValidationInfo> {
    val tokenFieldErrors =
        if (advancedSettings.isSelected) {
          notBlank(tokenField, CodyBundle.getString("login.dialog.validation.empty-token"))
              ?: custom(tokenField, CodyBundle.getString("login.dialog.validation.invalid-token")) {
                AuthorizationUtil.isValidAccessToken(tokenField.text)
              }
        } else null

    return listOfNotNull(
            notBlank(
                instanceUrlField,
                CodyBundle.getString("login.dialog.validation.empty-instance-url"))
                ?: validateServerPath(),
            tokenAcquisitionError,
            tokenFieldErrors)
        .toMutableList()
  }

  private fun validateServerPath(): ValidationInfo? =
      if (!isInstanceUrlValid(instanceUrlField)) {
        ValidationInfo(
            CodyBundle.getString("login.dialog.validation.invalid-instance-url"), instanceUrlField)
      } else {
        null
      }

  private fun isInstanceUrlValid(textField: JBTextField): Boolean =
      runCatching { SourcegraphServerPath.from(textField.text, "") }.getOrNull() != null

  private fun acquireDetailsAndToken(
      progressIndicator: ProgressIndicator
  ): CompletableFuture<Pair<CodyAccountDetails, String>> {
    tokenAcquisitionError = null

    val server = deriveServerPath()

    return service<ProgressManager>()
        .submitIOTask(progressIndicator) {
          val token = acquireToken(indicator = it, server.url)
          val executor = SourcegraphApiRequestExecutor.Factory.instance.create(server, token)
          val details =
              CodyTokenCredentialsUi.acquireDetails(executor, indicator = it, fixedLogin = null)
          return@submitIOTask details to token
        }
        .errorOnEdt(progressIndicator.modalityState) { error ->
          tokenAcquisitionError =
              when (error) {
                is SourcegraphParseException ->
                    ValidationInfo(
                        error.message
                            ?: CodyBundle.getString("login.dialog.validation.invalid-instance-url"),
                        instanceUrlField)
                is UnknownHostException ->
                    ValidationInfo(CodyBundle.getString("login.dialog.error.server-unreachable"))
                        .withOKEnabled()
                is SourcegraphAuthenticationException ->
                    ValidationInfo(
                        CodyBundle.getString("login.dialog.error.incorrect-credentials")
                            .fmt(error.message.orEmpty()))
                else ->
                    ValidationInfo(
                        CodyBundle.getString("login.dialog.error.invalid-authentication")
                            .fmt(error.message.orEmpty()))
              }
        }
  }

  private fun acquireToken(indicator: ProgressIndicator, server: String): String {
    val credentialsFuture =
        if (advancedSettings.isSelected) {
          CompletableFuture.completedFuture(tokenField.text)
        } else {
          SourcegraphAuthService.instance.authorize(server, SsoAuthMethod.DEFAULT)
        }

    try {
      return ProgressIndicatorUtils.awaitWithCheckCanceled(credentialsFuture, indicator)
    } catch (pce: ProcessCanceledException) {
      credentialsFuture.completeExceptionally(pce)
      throw pce
    }
  }

  private fun deriveServerPath(): SourcegraphServerPath {
    val customRequestHeaders =
        if (advancedSettings.isSelected) {
          customRequestHeadersField.text.trim()
        } else {
          ""
        }
    return SourcegraphServerPath.from(
        uri = instanceUrlField.text.trim().lowercase(), customRequestHeaders)
  }
}
