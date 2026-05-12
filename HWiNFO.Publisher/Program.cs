using CpuData.Publisher.Configuration;
using CpuData.Publisher.Infrastructure;
using CpuData.Publisher.Services;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<MqttOptions>(builder.Configuration.GetSection(MqttOptions.SectionName));

builder.Services.AddSingleton<ICpuDataReader, LibreHardwareReader>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();