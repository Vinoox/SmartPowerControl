namespace SmartPower.Controller;

public class MqttOptions
{
    public const string SectionName = "Mqtt";

    public string BrokerIp { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 1883;
    public string Topic { get; set; } = "telemetry/cpu/temp";
}