using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetFoldingRangeParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
  }
}
