using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SerializedChatMessage
  {
    [JsonProperty(PropertyName = "contextFiles")]
    public ContextItem[] ContextFiles { get; set; }
    [JsonProperty(PropertyName = "error")]
    public ChatError Error { get; set; }
    [JsonProperty(PropertyName = "editorState")]
    public Object EditorState { get; set; }
    [JsonProperty(PropertyName = "speaker")]
    public SpeakerEnum Speaker { get; set; } // Oneof: human, assistant, system
    [JsonProperty(PropertyName = "text")]
    public string Text { get; set; }
    [JsonProperty(PropertyName = "model")]
    public string Model { get; set; }

    public enum SpeakerEnum
    {
      [EnumMember(Value = "human")]
      Human,
      [EnumMember(Value = "assistant")]
      Assistant,
      [EnumMember(Value = "system")]
      System,
    }
  }
}
