using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingRequestErrorsResult
  {

    [JsonPropertyName("errors")]
    public NetworkRequest[] Errors { get; set; }
  }
}
