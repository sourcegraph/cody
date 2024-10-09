using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatRemoteReposResult
  {
    [JsonProperty(PropertyName = "remoteRepos")]
    public Repo[] RemoteRepos { get; set; }
  }
}
