package com.sourcegraph.cody.config

import com.intellij.collaboration.async.CompletableFutureUtil.submitIOTask
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.StoragePathMacros
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

data class AuthenticationState(
    val tier: CompletableFuture<AccountTier>,
    val isTokenInvalid: CompletableFuture<Boolean>
)

/** Entry point for interactions with Sourcegraph authentication subsystem */
@State(
    name = "CodyActiveAccount",
    storages = [Storage(StoragePathMacros.WORKSPACE_FILE)],
    reportStatistic = false)
@Service(Service.Level.PROJECT)
class CodyAuthenticationManager(val project: Project) :
    PersistentStateComponent<CodyAuthenticationManager.AccountState>, Disposable {

  var account: CodyAccount? = null
    private set

  private val scheduler = Executors.newScheduledThreadPool(1)

  private val publisher = project.messageBus.syncPublisher(AccountSettingChangeActionNotifier.TOPIC)

  @Volatile private var tier: CompletableFuture<AccountTier>? = null

  @Volatile private var isTokenInvalid: CompletableFuture<Boolean>? = null

  init {
    scheduler.scheduleAtFixedRate(
        /* command = */ { getAuthenticationState() },
        /* initialDelay = */ 2,
        /* period = */ 2,
        /* unit = */ TimeUnit.HOURS)

    val frame = WindowManager.getInstance().getFrame(project)
    val listener =
        object : WindowAdapter() {
          override fun windowActivated(e: WindowEvent?) {
            super.windowActivated(e)
            getAuthenticationState()
          }
        }
    frame?.addWindowListener(listener)
    Disposer.register(this) { frame?.removeWindowListener(listener) }
  }

  private val accountManager: CodyAccountManager
    get() = service()

  @CalledInAny fun getAccounts(): Set<CodyAccount> = accountManager.accounts

  @CalledInAny
  private fun getAuthenticationState(): AuthenticationState {
    val previousIsTokenInvalid = isTokenInvalid?.getNow(null)
    val previousTier = tier?.getNow(null)
    val isTokenInvalidFuture = CompletableFuture<Boolean>()
    val tierFuture = CompletableFuture<AccountTier>()
    val authenticationState = AuthenticationState(tierFuture, isTokenInvalidFuture)
    val theAccount = account ?: return authenticationState
    val token = theAccount.let(::getTokenForAccount)

    if (isTokenInvalid == null) isTokenInvalid = isTokenInvalidFuture
    if (tier == null) tier = tierFuture

    tierFuture.thenApply { currentAccountTier ->
      if (previousTier != currentAccountTier) {
        if (!project.isDisposed) {
          tier = tierFuture
          publisher.afterAction(AccountSettingChangeContext(accountTierChanged = true))
        }
      }
    }

    isTokenInvalidFuture.thenApply { isInvalid ->
      if (previousIsTokenInvalid != isInvalid) {
        if (!project.isDisposed) {
          isTokenInvalid = isTokenInvalidFuture
          publisher.afterAction(AccountSettingChangeContext(isTokenInvalidChanged = true))
        }
      }
    }

    if (token != null) {
      val executor = SourcegraphApiRequestExecutor.Factory.instance.create(theAccount.server, token)
      val progressIndicator = EmptyProgressIndicator(ModalityState.NON_MODAL)
      val submitIOTask =
          service<ProgressManager>().submitIOTask(progressIndicator) {
            if (theAccount.isEnterpriseAccount()) {
              // We ignore the result, but we need to make sure the request is executed
              // successfully. Otherwise, the token will be invalidated and the user will be
              // prompted to re-authenticate.
              SourcegraphApiRequests.CurrentUser(executor, progressIndicator).getDetails()
              tierFuture.complete(AccountTier.ENTERPRISE)
            } else {
              // We need a separate request to check if the user is on Cody Pro.
              val codyProEnabled =
                  SourcegraphApiRequests.CurrentUser(executor, progressIndicator)
                      .getCodyProEnabled()
              val currentAccountType =
                  if (codyProEnabled.codyProEnabled == true) {
                    AccountTier.DOTCOM_PRO
                  } else {
                    AccountTier.DOTCOM_FREE
                  }
              tierFuture.complete(currentAccountType)
            }
          }

      submitIOTask.exceptionally { error ->
        isTokenInvalidFuture.complete(error.cause?.message == UNAUTHORIZED_ERROR_MESSAGE)
        null
      }
    }

    return authenticationState
  }

  /**
   * User account type can change because users can renew or cancel their subscriptions at any time.
   * Components which state depends on this property should be checking state of
   * `getActiveAccountTier` in non-blocking way or listen for `AccountSettingChangeContext` events
   * to update their state accordingly later.
   */
  @CalledInAny
  fun getActiveAccountTier(): CompletableFuture<AccountTier> {
    return tier ?: getAuthenticationState().tier
  }

  @CalledInAny
  fun getIsTokenInvalid(): CompletableFuture<Boolean> {
    return isTokenInvalid ?: getAuthenticationState().isTokenInvalid
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
  internal fun updateAccountToken(newAccount: CodyAccount, newToken: String) {
    val oldToken = getTokenForAccount(newAccount)
    accountManager.updateAccount(newAccount, newToken)
    if (oldToken != newToken && newAccount == account) {
      CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
        if (!project.isDisposed) {
          agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
          publisher.afterAction(AccountSettingChangeContext(accessTokenChanged = true))
        }
      }
    }
  }

  fun setActiveAccount(newAccount: CodyAccount?) {
    if (!project.isDisposed) {
      val previousAccount = account
      val previousUrl = previousAccount?.server?.url
      val previousTier = previousAccount?.isDotcomAccount()

      this.account = newAccount
      tier = null
      isTokenInvalid = null

      val serverUrlChanged = previousUrl != newAccount?.server?.url
      val tierChanged = previousTier != newAccount?.isDotcomAccount()
      val accountChanged = previousAccount != newAccount

      CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
        if (!project.isDisposed) {
          agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
          if (serverUrlChanged || tierChanged || accountChanged) {
            publisher.afterAction(
                AccountSettingChangeContext(
                    serverUrlChanged = serverUrlChanged,
                    accountTierChanged = tierChanged,
                    accessTokenChanged = accountChanged))
          }
        }
      }
    }
  }

  fun hasActiveAccount() = !hasNoActiveAccount()

  fun hasNoActiveAccount() = account == null

  fun showInvalidAccessTokenError() = getIsTokenInvalid().getNow(null) == true

  override fun dispose() {
    scheduler.shutdown()
  }

  override fun getState(): AccountState {
    return AccountState().apply { activeAccountId = account?.id }
  }

  override fun loadState(state: AccountState) {
    val initialAccount =
        state.activeAccountId?.let { id -> accountManager.accounts.find { it.id == id } }
            ?: getAccounts().firstOrNull()
    if (initialAccount != null) {
      setActiveAccount(initialAccount)
    }
  }

  override fun noStateLoaded() {
    super.noStateLoaded()
    loadState(AccountState())
  }

  companion object {

    @JvmStatic
    fun getInstance(project: Project): CodyAuthenticationManager {
      return project.service<CodyAuthenticationManager>()
    }
  }

  class AccountState {
    var activeAccountId: String? = null
  }
}
