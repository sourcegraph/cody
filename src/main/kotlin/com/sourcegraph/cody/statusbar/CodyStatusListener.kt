package com.sourcegraph.cody.statusbar

import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic

interface CodyStatusListener {
  fun onCodyAutocompleteStatus(codyStatus: CodyStatus)

  fun onCodyAutocompleteStatusReset(project: Project)

  companion object {
    val TOPIC = Topic.create("cody.autocomplete.status", CodyStatusListener::class.java)
  }
}
