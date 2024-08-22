using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatRemoteReposResult
  {

    [JsonPropertyName("remoteRepos")]
    public Repo[] RemoteRepos { get; set; }
  }
}
