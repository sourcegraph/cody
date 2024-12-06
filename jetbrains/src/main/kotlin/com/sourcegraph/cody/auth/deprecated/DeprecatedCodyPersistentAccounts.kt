package com.sourcegraph.cody.auth.deprecated

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.SettingsCategory
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(
    name = "CodyAccounts",
    storages =
        [
            Storage(value = "cody_accounts.xml"),
        ],
    reportStatistic = false,
    category = SettingsCategory.TOOLS)
class DeprecatedCodyPersistentAccounts : PersistentStateComponent<Array<DeprecatedCodyAccount>> {

  private var state = emptyArray<DeprecatedCodyAccount>()

  var accounts: Set<DeprecatedCodyAccount>
    get() = state.toSet()
    set(value) {
      state = value.toTypedArray()
    }

  override fun getState(): Array<DeprecatedCodyAccount> = state

  override fun loadState(state: Array<DeprecatedCodyAccount>) {
    this.state = state
  }
}
