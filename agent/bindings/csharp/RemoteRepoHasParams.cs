using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoHasParams
  {

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }
  }
}
