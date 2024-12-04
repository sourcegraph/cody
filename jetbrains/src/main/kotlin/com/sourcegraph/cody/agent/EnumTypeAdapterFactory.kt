package com.sourcegraph.cody.agent

import com.google.gson.*
import com.google.gson.annotations.SerializedName
import com.google.gson.reflect.TypeToken
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonWriter
import java.io.IOException
import java.lang.reflect.Field

class EnumTypeAdapterFactory : TypeAdapterFactory {
  override fun <T> create(gson: Gson, type: TypeToken<T>): TypeAdapter<T>? {
    val rawType = type.rawType as? Class<*> ?: return null
    if (!rawType.isEnum) {
      return null
    }
    @Suppress("UNCHECKED_CAST")
    return EnumTypeAdapter(rawType as Class<out Enum<*>>) as TypeAdapter<T>
  }
}

class EnumTypeAdapter<T : Enum<T>>(private val classOfT: Class<T>) : TypeAdapter<T>() {
  private val nameToConstant: Map<String, T> = HashMap()
  private val constantToName: Map<T, String> = HashMap()

  init {
    for (constant in classOfT.enumConstants) {
      val name = getSerializedName(constant) ?: constant.name
      (nameToConstant as HashMap)[name.lowercase()] = constant
      (constantToName as HashMap)[constant] = name
    }
  }

  private fun getSerializedName(enumConstant: T): String? {
    return try {
      val field: Field = classOfT.getField(enumConstant.name)
      field.getAnnotation(SerializedName::class.java)?.value
    } catch (e: NoSuchFieldException) {
      null
    }
  }

  override fun write(out: JsonWriter, value: T?) {
    if (value == null) {
      out.nullValue()
    } else {
      out.value(constantToName[value])
    }
  }

  @Throws(IOException::class)
  override fun read(`in`: JsonReader): T? {
    val value = `in`.nextString()
    return nameToConstant[value.lowercase()]
        ?: throw JsonParseException("Unknown enum value: $value")
  }
}
