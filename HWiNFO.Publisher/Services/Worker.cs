using System.Globalization;
using CpuData.Publisher.Configuration;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;

namespace CpuData.Publisher.Services;

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
                catch { await Task.Delay(300, stoppingToken); continue; }
            }

            try
            {
                float cpuTemp = _sensorReader.GetCpuTemperature();
                float cpuPower = _sensorReader.GetCpuPower();

                string tempPayload = Math.Round(cpuTemp, 1).ToString(CultureInfo.InvariantCulture);
                string powerPayload = Math.Round(cpuPower, 1).ToString(CultureInfo.InvariantCulture);

                var tempMessage = new MqttApplicationMessageBuilder()
                    .WithTopic(_mqttOptions.TopicTemperature)
                    .WithPayload(tempPayload)
                    .Build();

                var powerMessage = new MqttApplicationMessageBuilder()
                    .WithTopic(_mqttOptions.TopicPower)
                    .WithPayload(powerPayload)
                    .Build();

                await _mqttClient.PublishAsync(tempMessage, stoppingToken);
                await _mqttClient.PublishAsync(powerMessage, stoppingToken);

                _logger.LogInformation($"Wys³ano -> Temat: {_mqttOptions.TopicTemperature} | Wartoœæ: {tempPayload}°C");
                _logger.LogInformation($"Wys³ano -> Temat: {_mqttOptions.TopicPower} | Wartoœæ: {powerPayload}W");
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"B³¹d odczytu/wysy³ki: {ex.Message}");
            }

            await Task.Delay(1000, stoppingToken);
        }
    }
}