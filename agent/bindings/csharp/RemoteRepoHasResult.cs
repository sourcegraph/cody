using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoHasResult
  {
    [JsonProperty(PropertyName = "result")]
    public bool Result { get; set; }
  }
}
