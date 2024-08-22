using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class FeatureFlagsGetFeatureFlagParams
  {

    [JsonPropertyName("flagName")]
    public string FlagName { get; set; }
  }
}
