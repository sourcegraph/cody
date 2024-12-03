package com.sourcegraph.cody.agent.protocol_extensions

inline fun <reified T : Enum<T>> String.toEnumIgnoreCase(): T? {
  return enumValues<T>().firstOrNull { it.name.equals(this, ignoreCase = true) }
}
