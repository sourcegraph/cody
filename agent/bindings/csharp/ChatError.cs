using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatError
  {

    [JsonPropertyName("kind")]
    public string Kind { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; }

    [JsonPropertyName("retryAfter")]
    public string RetryAfter { get; set; }

    [JsonPropertyName("limit")]
    public int Limit { get; set; }

    [JsonPropertyName("userMessage")]
    public string UserMessage { get; set; }

    [JsonPropertyName("retryAfterDate")]
    public Date RetryAfterDate { get; set; }

    [JsonPropertyName("retryAfterDateString")]
    public string RetryAfterDateString { get; set; }

    [JsonPropertyName("retryMessage")]
    public string RetryMessage { get; set; }

    [JsonPropertyName("feature")]
    public string Feature { get; set; }

    [JsonPropertyName("upgradeIsAvailable")]
    public bool UpgradeIsAvailable { get; set; }

    [JsonPropertyName("isChatErrorGuard")]
    public IsChatErrorGuardEnum IsChatErrorGuard { get; set; } // Oneof: isChatErrorGuard

    public enum IsChatErrorGuardEnum
    {
      [JsonPropertyName("isChatErrorGuard")]
      IsChatErrorGuard,
    }
  }
}
