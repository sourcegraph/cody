using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CurrentUserCodySubscription
  {
    [JsonProperty(PropertyName = "status")]
    public string Status { get; set; }
    [JsonProperty(PropertyName = "plan")]
    public string Plan { get; set; }
    [JsonProperty(PropertyName = "applyProRateLimits")]
    public bool ApplyProRateLimits { get; set; }
    [JsonProperty(PropertyName = "currentPeriodStartAt")]
    public Date CurrentPeriodStartAt { get; set; }
    [JsonProperty(PropertyName = "currentPeriodEndAt")]
    public Date CurrentPeriodEndAt { get; set; }
  }
}
