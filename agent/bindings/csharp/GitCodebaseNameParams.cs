using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GitCodebaseNameParams
  {

    [JsonPropertyName("url")]
    public string Url { get; set; }
  }
}
