package com.sourcegraph.cody.edit.lenses

import com.intellij.codeInsight.codeVision.settings.CodeVisionGroupSettingProvider

class EditCodeVisionGroupSettingProvider : CodeVisionGroupSettingProvider {
  override val groupId: String = "EditCodeVisionProvider"

  override val groupName: String = "Cody Edit Lenses"

  override val description: String =
      "Lenses used by Cody for displaying control actions for the given edit"
}
