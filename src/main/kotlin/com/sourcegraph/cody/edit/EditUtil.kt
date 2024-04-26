package com.sourcegraph.cody.edit

import com.sourcegraph.config.ThemeUtil
import java.awt.Color
import javax.swing.UIManager

object EditUtil {

  // Get a theme color like "Button.default.borderColor".
  fun getThemeColor(key: String): Color? {
    return UIManager.getColor(key)
  }

  // Dark -> darker. Bright -> brighter.
  fun getEnhancedThemeColor(key: String): Color? {
    return enhance(getThemeColor(key) ?: return null)
  }

  fun getSubduedThemeColor(key: String): Color? {
    return subdue(getThemeColor(key) ?: return null)
  }

  fun getMutedThemeColor(key: String): Color? {
    return mute(getThemeColor(key) ?: return null)
  }

  // Makes the color more prominent.
  fun enhance(color: Color): Color {
    return if (ThemeUtil.isDarkTheme()) {
      color.darker()
    } else {
      color.brighter()
    }
  }

  // Makes the color less prominent.
  fun subdue(color: Color): Color {
    return if (ThemeUtil.isDarkTheme()) {
      color.brighter()
    } else {
      color.darker()
    }
  }

  // Makes the color strictly darker.
  fun mute(color: Color): Color {
    return if (ThemeUtil.isDarkTheme()) {
      color
    } else {
      color.darker()
    }
  }
}
