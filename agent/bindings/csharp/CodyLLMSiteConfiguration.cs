using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyLLMSiteConfiguration
  {

    [JsonPropertyName("chatModel")]
    public string ChatModel { get; set; }

    [JsonPropertyName("chatModelMaxTokens")]
    public int ChatModelMaxTokens { get; set; }

    [JsonPropertyName("fastChatModel")]
    public string FastChatModel { get; set; }

    [JsonPropertyName("fastChatModelMaxTokens")]
    public int FastChatModelMaxTokens { get; set; }

    [JsonPropertyName("completionModel")]
    public string CompletionModel { get; set; }

    [JsonPropertyName("completionModelMaxTokens")]
    public int CompletionModelMaxTokens { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("smartContextWindow")]
    public bool SmartContextWindow { get; set; }
  }
}
