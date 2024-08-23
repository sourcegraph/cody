using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressReportParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
    [JsonProperty(PropertyName = "increment")]
    public int Increment { get; set; }
  }
}
