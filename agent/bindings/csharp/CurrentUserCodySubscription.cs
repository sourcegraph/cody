using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CurrentUserCodySubscription
  {

    [JsonPropertyName("status")]
    public string Status { get; set; }

    [JsonPropertyName("plan")]
    public string Plan { get; set; }

    [JsonPropertyName("applyProRateLimits")]
    public bool ApplyProRateLimits { get; set; }

    [JsonPropertyName("currentPeriodStartAt")]
    public Date CurrentPeriodStartAt { get; set; }

    [JsonPropertyName("currentPeriodEndAt")]
    public Date CurrentPeriodEndAt { get; set; }
  }
}
