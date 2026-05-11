using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;

namespace HWiNFO.Publisher;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly ICpuTemperatureReader _sensorReader;
    private readonly MqttOptions _mqttOptions;
    private IMqttClient _mqttClient;

    public Worker(ILogger<Worker> logger, ICpuTemperatureReader sensorReader, IOptions<MqttOptions> mqttOptions)
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

                float? cpuTemp = _sensorReader.GetCurrentTemperature();

                if (cpuTemp.HasValue)
                {
                    var payload = JsonSerializer.Serialize(new { temperature = Math.Round(cpuTemp.Value, 1) });
                    var message = new MqttApplicationMessageBuilder()
                        .WithTopic(_mqttOptions.Topic)
                        .WithPayload(payload)
                        .Build();

                    await _mqttClient.PublishAsync(message, stoppingToken);
                    _logger.LogInformation($"Wys³ano: {Math.Round(cpuTemp.Value, 1)}°C");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"B³¹d odczytu: {ex.Message}");
            }

            await Task.Delay(1000, stoppingToken);
        }
    }
}