using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class FeatureFlagsGetFeatureFlagParams
  {
    [JsonProperty(PropertyName = "flagName")]
    public string FlagName { get; set; }
  }
}
