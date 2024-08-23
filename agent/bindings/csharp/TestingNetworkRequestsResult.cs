using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingNetworkRequestsResult
  {
    [JsonProperty(PropertyName = "requests")]
    public NetworkRequest[] Requests { get; set; }
  }
}
