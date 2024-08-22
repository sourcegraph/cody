using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdParams
  {

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }
  }
}
