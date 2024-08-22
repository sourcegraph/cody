using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTaskAcceptParams
  {

    [JsonPropertyName("id")]
    public FixupTaskID Id { get; set; }
  }
}
