using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SerializedChatMessage
  {

    [JsonPropertyName("contextFiles")]
    public ContextItem[] ContextFiles { get; set; }

    [JsonPropertyName("error")]
    public ChatError Error { get; set; }

    [JsonPropertyName("editorState")]
    public Object EditorState { get; set; }

    [JsonPropertyName("speaker")]
    public SpeakerEnum Speaker { get; set; } // Oneof: human, assistant, system

    [JsonPropertyName("text")]
    public string Text { get; set; }

    [JsonPropertyName("model")]
    public string Model { get; set; }

    public enum SpeakerEnum
    {
      [JsonPropertyName("human")]
      Human,
      [JsonPropertyName("assistant")]
      Assistant,
      [JsonPropertyName("system")]
      System,
    }
  }
}
