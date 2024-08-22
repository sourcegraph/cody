using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressReportParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; }

    [JsonPropertyName("increment")]
    public int Increment { get; set; }
  }
}
