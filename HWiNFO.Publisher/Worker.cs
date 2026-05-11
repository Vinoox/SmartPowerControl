using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;

namespace HWiNFO.Publisher;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly ICpuDataReader _sensorReader;
    private readonly MqttOptions _mqttOptions;
    private IMqttClient _mqttClient;

    public Worker(ILogger<Worker> logger, ICpuDataReader sensorReader, IOptions<MqttOptions> mqttOptions)
    {
        _logger = logger;
        _sensorReader = sensorReader;
        _mqttOptions = mqttOptions.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new MqttFactory();
        _mqttClient = factory.CreateMqttClient();

        var options = new MqttClientOptionsBuilder()
            .WithClientId("SensorNode_LibreHM")
            .WithTcpServer(_mqttOptions.BrokerIp, _mqttOptions.Port)
            .Build();

        while (!stoppingToken.IsCancellationRequested)
        {
            if (!_mqttClient.IsConnected)
            {
                try { await _mqttClient.ConnectAsync(options, stoppingToken); }
                catch { await Task.Delay(2000, stoppingToken); continue; }
            }

            try
            {
                float cpuTemp = _sensorReader.GetCpuTemperature();
                float cpuPower = _sensorReader.GetCpuPower();

                // Dodanie parametru power do pakietu JSON
                var payloadObj = new
                {
                    temperature = Math.Round(cpuTemp, 1),
                    power = Math.Round(cpuPower, 1)
                };
                var payload = JsonSerializer.Serialize(payloadObj);

                var message = new MqttApplicationMessageBuilder()
                    .WithTopic(_mqttOptions.Topic)
                    .WithPayload(payload)
                    .Build();

                await _mqttClient.PublishAsync(message, stoppingToken);
                _logger.LogInformation($"Wys³ano: Temp: {payloadObj.temperature}°C, Moc: {payloadObj.power}W");
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"B³¹d odczytu: {ex.Message}");
            }

            await Task.Delay(1000, stoppingToken);
        }
    }
}