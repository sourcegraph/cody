using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingNetworkRequestsResult
  {

    [JsonPropertyName("requests")]
    public NetworkRequest[] Requests { get; set; }
  }
}
