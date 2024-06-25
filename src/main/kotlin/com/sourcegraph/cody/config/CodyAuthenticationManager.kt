package com.sourcegraph.cody.config

import com.intellij.collaboration.async.CompletableFutureUtil.submitIOTask
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.WindowManager
import com.intellij.util.AuthData
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.api.SourcegraphApiRequestExecutor
import com.sourcegraph.cody.api.SourcegraphApiRequests
import com.sourcegraph.cody.config.notification.AccountSettingChangeActionNotifier
import com.sourcegraph.cody.config.notification.AccountSettingChangeContext
import com.sourcegraph.cody.config.notification.AccountSettingChangeContext.Companion.UNAUTHORIZED_ERROR_MESSAGE
import com.sourcegraph.config.ConfigUtil
import java.awt.Component
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.jetbrains.annotations.CalledInAny

internal class CodyAuthData(val account: CodyAccount, login: String, token: String) :
    AuthData(login, token) {
  val server: SourcegraphServerPath
    get() = account.server

  val token: String
    get() = password!!
}

enum class AccountTier(val value: Int) {
  DOTCOM_FREE(0),
  DOTCOM_PRO(1),
  ENTERPRISE(2)
}

/** Entry point for interactions with Sourcegraph authentication subsystem */
@Service(Service.Level.PROJECT)
class CodyAuthenticationManager(val project: Project) : Disposable {

  private val scheduler = Executors.newScheduledThreadPool(1)

  private val publisher = project.messageBus.syncPublisher(AccountSettingChangeActionNotifier.TOPIC)

  @Volatile private var activeAccountTier: CompletableFuture<AccountTier?>? = null

  @Volatile private var isTokenInvalid: CompletableFuture<Boolean?>? = null

  init {
    scheduler.scheduleAtFixedRate(
        /* command = */ {
          getActiveAccountTier(forceRefresh = true)
          getIsTokenInvalid(forceRefresh = true)
        },
        /* initialDelay = */ 2,
        /* period = */ 2,
        /* unit = */ TimeUnit.HOURS)

    val frame = WindowManager.getInstance().getFrame(project)
    val listener =
        object : WindowAdapter() {
          override fun windowActivated(e: WindowEvent?) {
            super.windowActivated(e)
            getActiveAccountTier(forceRefresh = true)
            getIsTokenInvalid(forceRefresh = true)
          }
        }
    frame?.addWindowListener(listener)
    Disposer.register(this) { frame?.removeWindowListener(listener) }
  }

  private val accountManager: CodyAccountManager
    get() = service()

  @CalledInAny fun getAccounts(): Set<CodyAccount> = accountManager.accounts

  @CalledInAny
  fun getActiveAccountTier(): CompletableFuture<AccountTier?> =
      getActiveAccountTier(forceRefresh = false)

  @CalledInAny
  fun getIsTokenInvalid(): CompletableFuture<Boolean?> = getIsTokenInvalid(forceRefresh = false)

  /**
   * User account type can change because users can renew or cancel their subscriptions at any time.
   * Components which state depends on this property should be checking state of
   * `getActiveAccountTier` in non-blocking way or listen for `AccountSettingChangeContext` events
   * to update their state accordingly later.
   */
  @CalledInAny
  private fun getActiveAccountTier(forceRefresh: Boolean): CompletableFuture<AccountTier?> {
    activeAccountTier?.let { if (!forceRefresh) return it }

    val account = getActiveAccount() ?: return CompletableFuture.completedFuture(null)
    val previousAccountTier = activeAccountTier?.getNow(null)
    val accountTierFuture = CompletableFuture<AccountTier?>()
    activeAccountTier = accountTierFuture

    accountTierFuture.thenApply { currentAccountTier ->
      if (previousAccountTier != currentAccountTier) {
        if (!project.isDisposed) {
          publisher.afterAction(AccountSettingChangeContext(accountTierChanged = true))
        }
      }
    }

    if (account.isEnterpriseAccount()) {
      accountTierFuture.complete(AccountTier.ENTERPRISE)
    } else {
      CodyAgentService.withAgent(project) { agent ->
        val isCurrentUserPro = agent.server.isCurrentUserPro().get()
        val currentAccountType =
            if (isCurrentUserPro) AccountTier.DOTCOM_PRO else AccountTier.DOTCOM_FREE
        accountTierFuture.complete(currentAccountType)
      }
    }

    return accountTierFuture
  }

  @CalledInAny
  private fun getIsTokenInvalid(forceRefresh: Boolean): CompletableFuture<Boolean?> {
    isTokenInvalid?.let { if (!forceRefresh) return it }

    val previousIsTokenInvalid = isTokenInvalid?.getNow(null)
    val isTokenInvalidFuture = CompletableFuture<Boolean?>()
    isTokenInvalid = isTokenInvalidFuture

    isTokenInvalidFuture.thenApply { isTokenInvalid ->
      if (previousIsTokenInvalid != isTokenInvalid) {
        if (!project.isDisposed) {
          publisher.afterAction(AccountSettingChangeContext(isTokenInvalidChanged = true))
        }
      }
    }

    val activeAccount = getActiveAccount()
    val token = activeAccount?.let(::getTokenForAccount)
    if (activeAccount != null && token != null) {
      val executor =
          SourcegraphApiRequestExecutor.Factory.instance.create(activeAccount.server, token)
      val progressIndicator = EmptyProgressIndicator(ModalityState.NON_MODAL)
      val submitIOTask =
          service<ProgressManager>().submitIOTask(progressIndicator) {
            SourcegraphApiRequests.CurrentUser(executor, progressIndicator).getDetails()
          }

      submitIOTask.exceptionally { error ->
        isTokenInvalidFuture.complete(error.cause?.message == UNAUTHORIZED_ERROR_MESSAGE)
        null
      }
    }

    return isTokenInvalidFuture
  }

  @CalledInAny
  internal fun getTokenForAccount(account: CodyAccount): String? =
      accountManager.findCredentials(account)

  internal fun isAccountUnique(name: String, server: SourcegraphServerPath) =
      accountManager.accounts.none { it.name == name && it.server.url == server.url }

  @RequiresEdt
  internal fun login(parentComponent: Component?, request: CodyLoginRequest): CodyAuthData? =
      request.loginWithToken(project, parentComponent)

  @RequiresEdt
  internal fun updateAccountToken(account: CodyAccount, newToken: String) {
    val oldToken = getTokenForAccount(account)
    accountManager.updateAccount(account, newToken)
    if (oldToken != newToken && account == getActiveAccount()) {
      CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
        agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
        if (!project.isDisposed) {
          publisher.afterAction(AccountSettingChangeContext(accessTokenChanged = true))
        }
      }
    }
  }

  fun getActiveAccount(): CodyAccount? {
    return if (!project.isDisposed) CodyProjectActiveAccountHolder.getInstance(project).account
    else null
  }

  fun setActiveAccount(account: CodyAccount?) {
    if (!project.isDisposed) {
      val previousAccount = getActiveAccount()
      val previousUrl = previousAccount?.server?.url
      val previousTier = previousAccount?.isDotcomAccount()

      CodyProjectActiveAccountHolder.getInstance(project).account = account
      activeAccountTier = null
      isTokenInvalid = null

      val serverUrlChanged = previousUrl != account?.server?.url
      val tierChanged = previousTier != account?.isDotcomAccount()

      if (serverUrlChanged || tierChanged) {
        CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
          agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
          if (!project.isDisposed) {
            publisher.afterAction(
                AccountSettingChangeContext(
                    serverUrlChanged = serverUrlChanged, accountTierChanged = tierChanged))
          }
        }
      }
    }
  }

  fun hasActiveAccount() = getActiveAccount() != null

  fun hasNoActiveAccount() = !hasActiveAccount()

  fun showInvalidAccessTokenError() = getIsTokenInvalid().getNow(null) == true

  override fun dispose() {
    scheduler.shutdown()
  }

  companion object {

    @JvmStatic
    fun getInstance(project: Project): CodyAuthenticationManager {
      return project.service<CodyAuthenticationManager>()
    }
  }
}
