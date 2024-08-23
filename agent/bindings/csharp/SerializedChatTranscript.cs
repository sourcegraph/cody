using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SerializedChatTranscript
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "chatTitle")]
    public string ChatTitle { get; set; }
    [JsonProperty(PropertyName = "interactions")]
    public SerializedChatInteraction[] Interactions { get; set; }
    [JsonProperty(PropertyName = "lastInteractionTimestamp")]
    public string LastInteractionTimestamp { get; set; }
    [JsonProperty(PropertyName = "enhancedContext")]
    public EnhancedContextParams EnhancedContext { get; set; }
  }
}
