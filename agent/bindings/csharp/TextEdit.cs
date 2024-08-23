using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  [JsonConverter(typeof(TextEditConverter))]
  public abstract class TextEdit
  {
      private class TextEditConverter : JsonConverter<TextEdit>
      {
        public override TextEdit Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
          var jsonDoc = JsonDocument.ParseValue(ref reader);
          var discriminator = jsonDoc.RootElement.GetProperty("type").GetString();
          switch (discriminator)
          {
            case "replace":
              return JsonSerializer.Deserialize<ReplaceTextEdit>(jsonDoc.RootElement.GetRawText(), options);
            case "insert":
              return JsonSerializer.Deserialize<InsertTextEdit>(jsonDoc.RootElement.GetRawText(), options);
            case "delete":
              return JsonSerializer.Deserialize<DeleteTextEdit>(jsonDoc.RootElement.GetRawText(), options);
            default:
              throw new JsonException($"Unknown discriminator {discriminator}");
            }
        }
        public override void Write(Utf8JsonWriter writer, ${name} value, JsonSerializerOptions options)
        {
          JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
  }

  public class ReplaceTextEdit : TextEdit
  {
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: replace
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
    [JsonProperty(PropertyName = "value")]
    public string Value { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "replace")]
      Replace,
    }
  }

  public class InsertTextEdit : TextEdit
  {
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: insert
    [JsonProperty(PropertyName = "position")]
    public Position Position { get; set; }
    [JsonProperty(PropertyName = "value")]
    public string Value { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "insert")]
      Insert,
    }
  }

  public class DeleteTextEdit : TextEdit
  {
    [JsonProperty(PropertyName = "type")]
    public TypeEnum Type { get; set; } // Oneof: delete
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
    [JsonProperty(PropertyName = "metadata")]
    public WorkspaceEditEntryMetadata Metadata { get; set; }

    public enum TypeEnum
    {
      [EnumMember(Value = "delete")]
      Delete,
    }
  }
  }
}
