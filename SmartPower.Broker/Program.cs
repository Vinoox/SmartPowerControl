using SmartPower.Broker.Configuration;
using SmartPower.Broker.Services;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<BrokerOptions>(builder.Configuration.GetSection(BrokerOptions.SectionName));

builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
