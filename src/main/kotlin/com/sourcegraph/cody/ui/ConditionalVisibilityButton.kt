package com.sourcegraph.cody.ui

import java.awt.Dimension

/**
 * [ConditionalVisibilityButton] is only made visible if visibility is allowed.
 *
 * This is to implement a hover visibility that is conditional on another factor, like enabling
 * attribution setting.
 */
class ConditionalVisibilityButton(text: String) : TransparentButton(text) {

  var visibilityAllowed: Boolean = true
    set(value) {
      field = value
      if (!value) {
        super.setVisible(false)
      }
    }

  override fun setVisible(value: Boolean) {
    if ((value && visibilityAllowed) // either make visible if visibility allowed
    || (!value) // or make invisible
    ) {
      super.setVisible(value)
    }
  }

  override fun getPreferredSize(): Dimension =
      if (visibilityAllowed) super.getPreferredSize() else Dimension(0, 0)
}
