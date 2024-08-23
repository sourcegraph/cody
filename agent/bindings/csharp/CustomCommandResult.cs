using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  [JsonConverter(typeof(CustomCommandResultConverter))]
  public abstract class CustomCommandResult
  {
      private class CustomCommandResultConverter : JsonConverter<CustomCommandResult>
      {
        public override CustomCommandResult Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
          var jsonDoc = JsonDocument.ParseValue(ref reader);
          var discriminator = jsonDoc.RootElement.GetProperty("type").GetString();
          switch (discriminator)
          {
            case "chat":
              return JsonSerializer.Deserialize<CustomChatCommandResult>(jsonDoc.RootElement.GetRawText(), options);
            case "edit":
              return JsonSerializer.Deserialize<CustomEditCommandResult>(jsonDoc.RootElement.GetRawText(), options);
            default:
              throw new JsonException($"Unknown discriminator {discriminator}");
            }
        }
        public override void Write(Utf8JsonWriter writer, ${name} value, JsonSerializerOptions options)
        {
          JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
  }

  public class CustomChatCommandResult : CustomCommandResult
  {
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: chat
    [JsonProperty(PropertyName = "chatResult")]
    public string ChatResult { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "chat")]
      Chat,
    }
  }

  public class CustomEditCommandResult : CustomCommandResult
  {
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: edit
    [JsonProperty(PropertyName = "editResult")]
    public EditTask EditResult { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "edit")]
      Edit,
    }
  }
  }
}
