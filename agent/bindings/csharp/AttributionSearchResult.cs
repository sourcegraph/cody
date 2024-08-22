using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AttributionSearchResult
  {

    [JsonPropertyName("error")]
    public string Error { get; set; }

    [JsonPropertyName("repoNames")]
    public string[] RepoNames { get; set; }

    [JsonPropertyName("limitHit")]
    public bool LimitHit { get; set; }
  }
}
