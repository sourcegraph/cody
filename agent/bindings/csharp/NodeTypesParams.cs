using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class NodeTypesParams
  {

    [JsonPropertyName("atCursor")]
    public string AtCursor { get; set; }

    [JsonPropertyName("parent")]
    public string Parent { get; set; }

    [JsonPropertyName("grandparent")]
    public string Grandparent { get; set; }

    [JsonPropertyName("greatGrandparent")]
    public string GreatGrandparent { get; set; }

    [JsonPropertyName("lastAncestorOnTheSameLine")]
    public string LastAncestorOnTheSameLine { get; set; }
  }
}
