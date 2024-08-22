using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoHasResult
  {

    [JsonPropertyName("result")]
    public bool Result { get; set; }
  }
}
