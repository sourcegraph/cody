package com.sourcegraph.cody.ui

import javax.swing.Icon

data class LLMComboBoxItem(val icon: Icon, val name: String, val codyProOnly: Boolean = true)
