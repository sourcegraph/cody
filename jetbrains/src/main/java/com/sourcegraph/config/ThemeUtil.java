package com.sourcegraph.config;

import com.google.gson.JsonObject;
import com.intellij.util.ui.UIUtil;
import java.awt.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import javax.swing.*;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ThemeUtil {
  private static final Logger logger = LoggerFactory.getLogger(ThemeUtil.class);

  @NotNull
  public static JsonObject getCurrentThemeAsJson() {
    JsonObject intelliJTheme = new JsonObject();
    UIDefaults defaults = UIManager.getDefaults();
    Enumeration<Object> keysEnumeration = defaults.keys();
    ArrayList<Object> keysList = Collections.list(keysEnumeration);
    for (Object key : keysList) {
      try {
        Object value = UIManager.get(key);
        if (value instanceof Color) {
          intelliJTheme.addProperty(key.toString(), getHexString(UIManager.getColor(key)));
        }
      } catch (Exception e) {
        logger.warn(e.getMessage());
      }
    }

    JsonObject theme = new JsonObject();
    theme.addProperty("isDarkTheme", isDarkTheme());
    theme.add("intelliJTheme", intelliJTheme);
    return theme;
  }

  public static boolean isDarkTheme() {
    return getBrightnessFromColor(UIUtil.getPanelBackground()) < 128;
  }

  @Nullable
  public static String getHexString(@Nullable Color color) {
    if (color != null) {
      String colorString = Integer.toHexString(color.getRGB());
      if (colorString.length() > 2) {
        return "#" + colorString.substring(2);
      } else {
        return "#000000";
      }
    } else {
      return null;
    }
  }

  /**
   * Calculates the brightness between 0 (dark) and 255 (bright) from the given color. Source: <a
   * href="https://alienryderflex.com/hsp.html">https://alienryderflex.com/hsp.html</a>
   */
  private static int getBrightnessFromColor(@NotNull Color color) {
    return (int)
        Math.sqrt(
            color.getRed() * color.getRed() * .299
                + color.getGreen() * color.getGreen() * .587
                + color.getBlue() * color.getBlue() * .114);
  }
}
