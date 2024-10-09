using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatError
  {
    [JsonProperty(PropertyName = "kind")]
    public string Kind { get; set; }
    [JsonProperty(PropertyName = "name")]
    public string Name { get; set; }
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
    [JsonProperty(PropertyName = "retryAfter")]
    public string RetryAfter { get; set; }
    [JsonProperty(PropertyName = "limit")]
    public int Limit { get; set; }
    [JsonProperty(PropertyName = "userMessage")]
    public string UserMessage { get; set; }
    [JsonProperty(PropertyName = "retryAfterDate")]
    public Date RetryAfterDate { get; set; }
    [JsonProperty(PropertyName = "retryAfterDateString")]
    public string RetryAfterDateString { get; set; }
    [JsonProperty(PropertyName = "retryMessage")]
    public string RetryMessage { get; set; }
    [JsonProperty(PropertyName = "feature")]
    public string Feature { get; set; }
    [JsonProperty(PropertyName = "upgradeIsAvailable")]
    public bool UpgradeIsAvailable { get; set; }
    [JsonProperty(PropertyName = "isChatErrorGuard")]
    public IsChatErrorGuardEnum IsChatErrorGuard { get; set; } // Oneof: isChatErrorGuard

    public enum IsChatErrorGuardEnum
    {
      [EnumMember(Value = "isChatErrorGuard")]
      IsChatErrorGuard,
    }
  }
}
