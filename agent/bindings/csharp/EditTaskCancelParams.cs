using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTaskCancelParams
  {

    [JsonPropertyName("id")]
    public FixupTaskID Id { get; set; }
  }
}
