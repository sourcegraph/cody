package com.sourcegraph.cody.auth

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.PersistentStateComponent

/**
 * Stores active account for project To
 * register - [@State(name = SERVICE_NAME_HERE, storages = [Storage(StoragePathMacros.WORKSPACE_FILE)],
 * reportStatistic = false)]
 *
 * @param A - account type
 */
abstract class PersistentActiveAccountHolder<A : Account> :
    PersistentStateComponent<PersistentActiveAccountHolder.AccountState>, Disposable {

  var account: A? = null

  private val accountManager: AccountManager<A, *>
    get() = accountManager()

  override fun getState(): AccountState {
    return AccountState().apply { activeAccountId = account?.id }
  }

  override fun loadState(state: AccountState) {
    account = state.activeAccountId?.let { id -> accountManager.accounts.find { it.id == id } }
  }

  protected abstract fun accountManager(): AccountManager<A, *>

  override fun dispose() {}

  class AccountState {
    var activeAccountId: String? = null
  }
}
