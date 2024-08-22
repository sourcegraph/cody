using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class UntitledTextDocument
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("language")]
    public string Language { get; set; }
  }
}
