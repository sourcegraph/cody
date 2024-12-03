package com.sourcegraph.cody.auth.deprecated

import com.intellij.credentialStore.Credentials
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.StoragePathMacros
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.auth.SourcegraphServerPath
import org.jetbrains.annotations.CalledInAny

class AccountState {
  var activeAccountId: String? = null
}

// That class is keep only for a compatibility purposes, so we can load old per-project account
// settings, and use them as the new default when `CodyAccountsSettings` state is loaded for a very
// first time in the `noStateLoaded` method
@Deprecated("Use only for backward compatibility purposes")
@State(
    name = "CodyActiveAccount",
    storages = [Storage(StoragePathMacros.WORKSPACE_FILE)],
    reportStatistic = false)
@Service(Service.Level.PROJECT)
class DeprecatedCodyActiveAccount(val project: Project) : PersistentStateComponent<AccountState> {
  private var accountState: AccountState? = null

  override fun getState(): AccountState? {
    return accountState
  }

  override fun loadState(state: AccountState) {
    accountState = state
  }
}

/** Entry point for interactions with Sourcegraph authentication subsystem */
@State(
    name = "CodyAccountsSettings",
    storages = [Storage("cody_accounts_settings.xml")],
    reportStatistic = false)
@Service(Service.Level.APP)
class DeprecatedCodyAccountManager : PersistentStateComponent<AccountState> {

  var account: DeprecatedCodyAccount? = null
    private set

  @CalledInAny
  fun getAccounts(): Set<DeprecatedCodyAccount> =
      service<DeprecatedCodyPersistentAccounts>().accounts

  fun hasActiveAccount(): Boolean = account != null

  fun setActiveAccount(newAccount: DeprecatedCodyAccount?) {
    account = newAccount
  }

  fun isAccountUnique(name: String, server: SourcegraphServerPath) =
      getAccounts().none { it.name == name && it.server.url == server.url }

  fun getTokenForAccount(account: DeprecatedCodyAccount): String? =
      PasswordSafe.instance.get(account.credentialAttributes())?.getPasswordAsString()

  @RequiresEdt
  internal fun addOrUpdateAccountToken(account: DeprecatedCodyAccount, newToken: String) {
    service<DeprecatedCodyPersistentAccounts>().accounts = (getAccounts() - account) + account
    PasswordSafe.instance.set(account.credentialAttributes(), Credentials(account.id, newToken))
  }

  override fun getState(): AccountState {
    return AccountState().apply { activeAccountId = account?.id }
  }

  override fun loadState(state: AccountState) {
    account = state.activeAccountId?.let { id -> getAccounts().find { it.id == id } }
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
    fun getInstance(): DeprecatedCodyAccountManager {
      return ApplicationManager.getApplication()
          .getService(DeprecatedCodyAccountManager::class.java)
    }
  }
}
