using HWiNFO.Publisher;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<MqttOptions>(builder.Configuration.GetSection(MqttOptions.SectionName));

builder.Services.AddSingleton<ICpuTemperatureReader, LibreHardwareReader>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();