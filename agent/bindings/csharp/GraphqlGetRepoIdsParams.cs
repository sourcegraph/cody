using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdsParams
  {

    [JsonPropertyName("names")]
    public string[] Names { get; set; }

    [JsonPropertyName("first")]
    public int First { get; set; }
  }
}
