package com.sourcegraph.config

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "GlobalCodySettings", storages = [Storage("cody.xml")])
class GlobalCodySettings : SimplePersistentStateComponent<CodySettingsState>(CodySettingsState()) {
  companion object {
    @JvmStatic
    fun getConfigJson(): String {
      val instance = ApplicationManager.getApplication().getService(GlobalCodySettings::class.java)
      return instance.state.jsonConfig ?: ""
    }
  }
}

class CodySettingsState : BaseState() {
  var jsonConfig by string()
}
