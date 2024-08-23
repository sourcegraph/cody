using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyLLMSiteConfiguration
  {
    [JsonProperty(PropertyName = "chatModel")]
    public string ChatModel { get; set; }
    [JsonProperty(PropertyName = "chatModelMaxTokens")]
    public int ChatModelMaxTokens { get; set; }
    [JsonProperty(PropertyName = "fastChatModel")]
    public string FastChatModel { get; set; }
    [JsonProperty(PropertyName = "fastChatModelMaxTokens")]
    public int FastChatModelMaxTokens { get; set; }
    [JsonProperty(PropertyName = "completionModel")]
    public string CompletionModel { get; set; }
    [JsonProperty(PropertyName = "completionModelMaxTokens")]
    public int CompletionModelMaxTokens { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "smartContextWindow")]
    public bool SmartContextWindow { get; set; }
  }
}
