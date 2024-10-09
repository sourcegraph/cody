using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressOptions
  {
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "location")]
    public string Location { get; set; }
    [JsonProperty(PropertyName = "locationViewId")]
    public string LocationViewId { get; set; }
    [JsonProperty(PropertyName = "cancellable")]
    public bool Cancellable { get; set; }
  }
}
