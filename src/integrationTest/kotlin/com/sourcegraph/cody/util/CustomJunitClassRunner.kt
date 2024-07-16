package com.sourcegraph.cody.util

import org.junit.runners.BlockJUnit4ClassRunner
import org.junit.runners.model.FrameworkMethod

class CustomJunitClassRunner(klass: Class<*>?) : BlockJUnit4ClassRunner(klass) {

  private val repeatTimes: UInt? = System.getProperty("repeatTests")?.toUIntOrNull()

  override fun isIgnored(child: FrameworkMethod?): Boolean {
    return repeatTimes == null && super.isIgnored(child)
  }
}
