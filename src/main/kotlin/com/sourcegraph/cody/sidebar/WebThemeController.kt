package com.sourcegraph.cody.sidebar

import com.intellij.openapi.application.invokeLater
import com.sourcegraph.config.ThemeUtil
import java.awt.Color
import javax.swing.UIManager

class WebThemeController {
  private var themeChangeListener: ((WebTheme) -> Unit)? = null

  init {
    UIManager.addPropertyChangeListener { event ->
      if (event.propertyName == "lookAndFeel") {
        invokeLater { themeChangeListener?.invoke(getTheme()) }
      }
    }
  }

  fun setThemeChangeListener(listener: (WebTheme) -> Unit) {
    themeChangeListener = listener
  }

  fun getTheme(): WebTheme {
    val themeVariables =
        UIManager.getDefaults()
            .filterValues { it is Color }
            .mapKeys { toCSSVariableName(it.key.toString()) }
            .mapValues { toCSSColor(it.value as Color) }
    return WebTheme(ThemeUtil.isDarkTheme(), themeVariables)
  }

  private fun toCSSColor(value: Color) =
      "rgb(${value.red} ${value.green} ${value.blue} / ${value.alpha / 255})"

  private fun toCSSVariableName(key: String) =
      "--jetbrains-${key.replace(Regex("[^-_a-zA-Z0-9]"), "-")}"
}

class WebTheme(val isDark: Boolean, val variables: Map<String, String>) {}