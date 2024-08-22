using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Repo
  {

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("id")]
    public string Id { get; set; }
  }
}
