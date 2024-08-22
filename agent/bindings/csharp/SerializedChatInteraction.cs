using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SerializedChatInteraction
  {

    [JsonPropertyName("humanMessage")]
    public SerializedChatMessage HumanMessage { get; set; }

    [JsonPropertyName("assistantMessage")]
    public SerializedChatMessage AssistantMessage { get; set; }
  }
}
