using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SerializedChatTranscript
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("chatTitle")]
    public string ChatTitle { get; set; }

    [JsonPropertyName("interactions")]
    public SerializedChatInteraction[] Interactions { get; set; }

    [JsonPropertyName("lastInteractionTimestamp")]
    public string LastInteractionTimestamp { get; set; }

    [JsonPropertyName("enhancedContext")]
    public EnhancedContextParams EnhancedContext { get; set; }
  }
}
