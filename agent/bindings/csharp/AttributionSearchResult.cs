using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AttributionSearchResult
  {
    [JsonProperty(PropertyName = "error")]
    public string Error { get; set; }
    [JsonProperty(PropertyName = "repoNames")]
    public string[] RepoNames { get; set; }
    [JsonProperty(PropertyName = "limitHit")]
    public bool LimitHit { get; set; }
  }
}
