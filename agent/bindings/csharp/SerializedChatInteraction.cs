using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SerializedChatInteraction
  {
    [JsonProperty(PropertyName = "humanMessage")]
    public SerializedChatMessage HumanMessage { get; set; }
    [JsonProperty(PropertyName = "assistantMessage")]
    public SerializedChatMessage AssistantMessage { get; set; }
  }
}
