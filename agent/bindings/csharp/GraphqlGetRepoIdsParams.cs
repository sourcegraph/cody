using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdsParams
  {
    [JsonProperty(PropertyName = "names")]
    public string[] Names { get; set; }
    [JsonProperty(PropertyName = "first")]
    public int First { get; set; }
  }
}
