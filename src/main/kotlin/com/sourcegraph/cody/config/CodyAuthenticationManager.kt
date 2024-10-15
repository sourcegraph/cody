package com.sourcegraph.cody.config

import com.intellij.collaboration.async.CompletableFutureUtil.submitIOTask
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
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
import com.intellij.openapi.project.ProjectManager
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

// That class is keep only for a compatibility purposes, so we can load old per-project account
// settings, and use them as the new default when `CodyAccountsSettings` state is loaded for a very
// first time in the `noStateLoaded` method
@Deprecated("Use only for backward compatibility purposes")
@State(
    name = "CodyActiveAccount",
    storages = [Storage(StoragePathMacros.WORKSPACE_FILE)],
    reportStatistic = false)
@Service(Service.Level.PROJECT)
class DeprecatedCodyActiveAccount(val project: Project) :
    PersistentStateComponent<CodyAuthenticationManager.AccountState> {
  private var accountState: CodyAuthenticationManager.AccountState? = null

  override fun getState(): CodyAuthenticationManager.AccountState? {
    return accountState
  }

  override fun loadState(state: CodyAuthenticationManager.AccountState) {
    accountState = state
  }
}

/** Entry point for interactions with Sourcegraph authentication subsystem */
@State(
    name = "CodyAccountsSettings",
    storages = [Storage("cody_accounts_settings.xml")],
    reportStatistic = false)
@Service(Service.Level.APP)
class CodyAuthenticationManager :
    PersistentStateComponent<CodyAuthenticationManager.AccountState>, Disposable {

  var account: CodyAccount? = null
    private set

  private val scheduler = Executors.newScheduledThreadPool(1)

  private fun publisher(project: Project) =
      project.messageBus.syncPublisher(AccountSettingChangeActionNotifier.TOPIC)

  @Volatile private var tier: CompletableFuture<AccountTier>? = null

  @Volatile private var isTokenInvalid: CompletableFuture<Boolean>? = null

  init {
    scheduler.scheduleAtFixedRate(
        /* command = */ { getAuthenticationState() },
        /* initialDelay = */ 2,
        /* period = */ 2,
        /* unit = */ TimeUnit.HOURS)
  }

  private val accountManager: CodyAccountManager
    get() = service()

  fun addAuthChangeListener(project: Project) {
    val frame = WindowManager.getInstance().getFrame(project)
    val listener =
        object : WindowAdapter() {
          override fun windowActivated(e: WindowEvent?) {
            super.windowActivated(e)
            ApplicationManager.getApplication().executeOnPooledThread { getAuthenticationState() }
          }
        }
    frame?.addWindowListener(listener)
    Disposer.register(this) { frame?.removeWindowListener(listener) }
  }

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
        tier = tierFuture
        ProjectManager.getInstance().openProjects.forEach { project ->
          publisher(project).afterAction(AccountSettingChangeContext(accountTierChanged = true))
        }
      }
    }

    isTokenInvalidFuture.thenApply { isInvalid ->
      if (previousIsTokenInvalid != isInvalid) {
        isTokenInvalid = isTokenInvalidFuture
        ProjectManager.getInstance().openProjects.forEach { project ->
          publisher(project).afterAction(AccountSettingChangeContext(isTokenInvalidChanged = true))
        }
      }
    }

    if (token != null) {
      val executor = SourcegraphApiRequestExecutor.Factory.instance.create(theAccount.server, token)
      val progressIndicator = EmptyProgressIndicator(ModalityState.nonModal())
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
    } else {
      isTokenInvalidFuture.complete(true)
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
  internal fun login(
      project: Project,
      parentComponent: Component?,
      request: CodyLoginRequest
  ): CodyAuthData? = request.loginWithToken(project, parentComponent)

  @RequiresEdt
  internal fun updateAccountToken(newAccount: CodyAccount, newToken: String) {
    val oldToken = getTokenForAccount(newAccount)
    accountManager.updateAccount(newAccount, newToken)
    if (oldToken != newToken && newAccount == account) {

      ProjectManager.getInstance().openProjects.forEach { project ->
        CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
          if (!project.isDisposed) {
            agent.server.extensionConfiguration_didChange(ConfigUtil.getAgentConfiguration(project))
            publisher(project).afterAction(AccountSettingChangeContext(accessTokenChanged = true))
          }
        }
      }
    }
  }

  fun setActiveAccount(newAccount: CodyAccount?) {
    val previousAccount = account
    val previousUrl = previousAccount?.server?.url
    val previousTier = previousAccount?.isDotcomAccount()

    account = newAccount
    tier = null
    isTokenInvalid = null

    val serverUrlChanged = previousUrl != newAccount?.server?.url
    val tierChanged = previousTier != newAccount?.isDotcomAccount()
    val accountChanged = previousAccount != newAccount

    ProjectManager.getInstance().openProjects.forEach { project ->
      CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
        if (!project.isDisposed) {
          agent.server.extensionConfiguration_didChange(ConfigUtil.getAgentConfiguration(project))
          if (serverUrlChanged || tierChanged || accountChanged) {
            publisher(project)
                .afterAction(
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

  fun removeAll() {
    accountManager.accounts.forEach { accountManager.removeAccount(it) }
  }

  override fun dispose() {
    scheduler.shutdown()
  }

  override fun getState(): AccountState {
    return AccountState().apply { activeAccountId = account?.id }
  }

  override fun loadState(state: AccountState) {
    val initialAccount =
        state.activeAccountId?.let { id -> accountManager.accounts.find { it.id == id } }

    if (initialAccount != null) {
      setActiveAccount(initialAccount)
    }
  }

  override fun noStateLoaded() {
    super.noStateLoaded()
    val initialAccountId =
        ProjectManager.getInstance().openProjects.firstNotNullOfOrNull {
          it.service<DeprecatedCodyActiveAccount>().state?.activeAccountId
        } ?: getAccounts().firstOrNull()?.id

    loadState(AccountState().apply { activeAccountId = initialAccountId })
  }

  companion object {

    @JvmStatic
    fun getInstance(): CodyAuthenticationManager {
      return ApplicationManager.getApplication().getService(CodyAuthenticationManager::class.java)
    }
  }

  class AccountState {
    var activeAccountId: String? = null
  }
}
