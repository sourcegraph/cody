package Cody.Core.Agent.Protocol;

public static class ProtocolTypeAdapters
{
  public static void Register(System.Text.Json.JsonSerializerOptions options)
  {
    options.Converters.Add(new ContextItemConverter());
    options.Converters.Add(new CustomCommandResultConverter());
    options.Converters.Add(new TextEditConverter());
    options.Converters.Add(new WorkspaceEditOperationConverter());
  }
}
