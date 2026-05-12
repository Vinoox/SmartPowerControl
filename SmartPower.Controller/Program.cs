using SmartPower.Controller.Configuration;
using SmartPower.Controller.DTOs;
using SmartPower.Controller.Infrastructure;
using SmartPower.Controller.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<PowerSystemState>();

builder.Services.Configure<MqttOptions>(builder.Configuration.GetSection(MqttOptions.SectionName));

builder.Services.AddSingleton<IPowerModeExecutor, HotkeyExecutor>();

builder.Services.AddHostedService<PowerControllerService>();

builder.Services.AddCors();

var app = builder.Build();

app.UseCors(x => x.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
app.UseDefaultFiles();
app.UseStaticFiles();


app.MapGet("/api/state", (PowerSystemState state) =>
{
    return Results.Ok(state);
});

app.MapPost("/api/config", (PowerSystemState state, PowerConfigDto newConfig) =>
{
    state.ThresholdTurbo = newConfig.ThresholdTurbo;
    state.ThresholdSilent = newConfig.ThresholdSilent;
    state.Hysteresis = newConfig.Hysteresis;

    return Results.Ok(new { message = "Konfiguracja zaktualizowana", state });
});

app.Run();