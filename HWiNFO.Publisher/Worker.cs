using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;
using LibreHardwareMonitor.Hardware;

namespace HWiNFO.Publisher;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private IMqttClient _mqttClient;

    // LibreHardwareMonitor wymaga wzorca "Visitor" do aktualizacji danych sprzêtowych
    public class UpdateVisitor : IVisitor
    {
        public void VisitComputer(IComputer computer) { computer.Traverse(this); }
        public void VisitHardware(IHardware hardware)
        {
            hardware.Update();
            foreach (IHardware subHardware in hardware.SubHardware) subHardware.Accept(this);
        }
        public void VisitSensor(ISensor sensor) { }
        public void VisitParameter(IParameter parameter) { }
    }

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new MqttFactory();
        _mqttClient = factory.CreateMqttClient();

        var options = new MqttClientOptionsBuilder()
            .WithClientId("SensorNode_LibreHM")
            .WithTcpServer("127.0.0.1", 1883)
            .Build();

        // Inicjalizacja sprzêtu (W³¹czamy tylko CPU, aby oszczêdzaæ zasoby)
        Computer computer = new Computer
        {
            IsCpuEnabled = true
        };
        computer.Open();

        while (!stoppingToken.IsCancellationRequested)
        {
            if (!_mqttClient.IsConnected)
            {
                try
                {
                    await _mqttClient.ConnectAsync(options, stoppingToken);
                    _logger.LogInformation("Po³¹czono z lokalnym Brokerem MQTT.");
                }
                catch
                {
                    await Task.Delay(2000, stoppingToken);
                    continue;
                }
            }

            try
            {
                // Odœwie¿enie danych z czujników
                computer.Accept(new UpdateVisitor());

                float? cpuTemp = null;

                // Szukanie czujnika "CPU Package" w drzewie sprzêtu
                foreach (var hardware in computer.Hardware)
                {
                    if (hardware.HardwareType == HardwareType.Cpu)
                    {
                        foreach (var sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature && sensor.Name.Contains("Package"))
                            {
                                cpuTemp = sensor.Value;
                                break;
                            }
                        }
                    }
                }

                // Wys³anie danych, jeœli odczyt siê powiód³
                if (cpuTemp.HasValue)
                {
                    var payload = JsonSerializer.Serialize(new { temperature = Math.Round(cpuTemp.Value, 1) });
                    var message = new MqttApplicationMessageBuilder()
                        .WithTopic("telemetry/cpu/temp")
                        .WithPayload(payload)
                        .Build();

                    await _mqttClient.PublishAsync(message, stoppingToken);
                    _logger.LogInformation($"Wys³ano: {Math.Round(cpuTemp.Value, 1)}°C");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"B³¹d odczytu czujników: {ex.Message}");
            }

            await Task.Delay(1000, stoppingToken);
        }

        computer.Close(); // Poprawne zwolnienie zasobów przy wy³¹czaniu
    }
}