package com.sourcegraph.common.ui

import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.NlsActions
import com.sourcegraph.cody.ui.BGTActionSetter
import javax.swing.Icon

abstract class DumbAwareBGTAction : DumbAwareAction {

  constructor() : super() {
    BGTActionSetter.runUpdateOnBackgroundThread(this)
  }

  constructor(icon: Icon?) : super(icon)

  constructor(text: @NlsActions.ActionText String?) : super(text)

  constructor(
      text: @NlsActions.ActionText String?,
      description: @NlsActions.ActionDescription String?,
      icon: Icon?
  ) : super(text, description, icon)
}
