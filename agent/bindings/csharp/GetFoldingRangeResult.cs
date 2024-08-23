using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetFoldingRangeResult
  {
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
  }
}
