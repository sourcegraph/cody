using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetFoldingRangeResult
  {

    [JsonPropertyName("range")]
    public Range Range { get; set; }
  }
}
