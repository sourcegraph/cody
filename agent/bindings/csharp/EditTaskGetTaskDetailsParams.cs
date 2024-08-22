using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTaskGetTaskDetailsParams
  {

    [JsonPropertyName("id")]
    public FixupTaskID Id { get; set; }
  }
}
