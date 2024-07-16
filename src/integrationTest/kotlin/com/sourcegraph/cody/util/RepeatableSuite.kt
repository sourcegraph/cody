package com.sourcegraph.cody.util

import org.junit.runners.Suite
import org.junit.runners.model.InitializationError
import org.junit.runners.model.RunnerBuilder

class RepeatableSuite(klass: Class<*>, builder: RunnerBuilder?) :
    Suite(builder, klass, getAnnotatedClasses(klass)) {

  init {
    if (repeatTimes < 1)
        throw IllegalStateException("Invalid value for repeatTimes (${repeatTimes} < 1)")
  }

  companion object {

    private val repeatTimes: Int = System.getProperty("repeatTests")?.toIntOrNull() ?: 1

    @Throws(InitializationError::class)
    fun getAnnotatedClasses(klass: Class<*>): Array<Class<*>> {
      val annotation = klass.getAnnotation(SuiteClasses::class.java)
      if (annotation == null) {
        throw InitializationError(
            String.format("class '%s' must have a SuiteClasses annotation", klass.name))
      } else {
        return annotation.value
            .map { it.java }
            .map { l -> List(repeatTimes) { l } }
            .flatten()
            .toTypedArray()
      }
    }
  }
}
