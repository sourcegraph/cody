using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DisabledParams
  {
    [JsonProperty(PropertyName = "reason")]
    public string Reason { get; set; }
  }
}
