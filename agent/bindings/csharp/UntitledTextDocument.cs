using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class UntitledTextDocument
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "content")]
    public string Content { get; set; }
    [JsonProperty(PropertyName = "language")]
    public string Language { get; set; }
  }
}
