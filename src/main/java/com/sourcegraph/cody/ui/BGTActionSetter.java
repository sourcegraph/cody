package com.sourcegraph.cody.ui;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.util.BitUtil;
import java.lang.reflect.Field;

/**
 * Since IJ 2024 every action which overrides `update` method needs to explicitly declare the thread
 * update runs on by returning proper ActionUpdateThread value. `BGTActionSetter` class hacks
 * internals of `AnAction::myMetaFlags` field which is used by `ActionClassMetaData` which in turn
 * is used in `AnAction::getActionUpdateThread` to determine if action should be run on the BGT
 * thread. For the details on ActionUpdateThread itself please refer on to the `ActionUpdateThread`
 * class.
 */
public class BGTActionSetter {
  public static void runUpdateOnBackgroundThread(AnAction action) {
    try {
      Field myFlagsField = AnAction.class.getDeclaredField("myMetaFlags");
      myFlagsField.trySetAccessible();

      // Values and logic partially copied from ActionClassMetaData
      int UPDATE = 0x2;
      int currentMetaFieldValue = (int) myFlagsField.get(action);
      myFlagsField.set(action, BitUtil.set(currentMetaFieldValue, UPDATE, /* setBit= */ true));
    } catch (NoSuchFieldException | IllegalAccessException ignored) {
    }
  }
}
