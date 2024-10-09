using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdsResult
  {
    [JsonProperty(PropertyName = "repos")]
    public ReposParams[] Repos { get; set; }
  }
}
