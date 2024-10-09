using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class NodeTypesWithCompletionParams
  {
    [JsonProperty(PropertyName = "atCursor")]
    public string AtCursor { get; set; }
    [JsonProperty(PropertyName = "parent")]
    public string Parent { get; set; }
    [JsonProperty(PropertyName = "grandparent")]
    public string Grandparent { get; set; }
    [JsonProperty(PropertyName = "greatGrandparent")]
    public string GreatGrandparent { get; set; }
    [JsonProperty(PropertyName = "lastAncestorOnTheSameLine")]
    public string LastAncestorOnTheSameLine { get; set; }
  }
}
