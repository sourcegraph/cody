using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdsResult
  {

    [JsonPropertyName("repos")]
    public ReposParams[] Repos { get; set; }
  }
}
