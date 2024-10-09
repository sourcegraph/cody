using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingRequestErrorsResult
  {
    [JsonProperty(PropertyName = "errors")]
    public NetworkRequest[] Errors { get; set; }
  }
}
