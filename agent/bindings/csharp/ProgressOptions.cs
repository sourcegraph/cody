using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressOptions
  {

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("location")]
    public string Location { get; set; }

    [JsonPropertyName("locationViewId")]
    public string LocationViewId { get; set; }

    [JsonPropertyName("cancellable")]
    public bool Cancellable { get; set; }
  }
}
