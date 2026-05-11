using SmartPower.Controller;

var builder = WebApplication.CreateBuilder(args);

// 1. Rejestrujemy nasz stan jako Singleton (jedna kopia dla ca³ej aplikacji)
builder.Services.AddSingleton<PowerSystemState>();

// 2. Rejestrujemy us³ugê dzia³aj¹c¹ w tle
builder.Services.AddHostedService<PowerControllerService>();

// 3. Pozwalamy na serwowanie statycznych plików (HTML/JS/CSS) z folderu wwwroot
builder.Services.AddCors(); // Przydatne przy pisaniu frontendu

var app = builder.Build();

app.UseCors(x => x.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
app.UseDefaultFiles();
app.UseStaticFiles(); // W³¹cza obs³ugê plików w folderze wwwroot (zrobimy to zaraz)

// --- NASZE ENDPOINTY API ---

// Zwraca aktualny stan systemu (dla wykresu na ¿ywo)
app.MapGet("/api/state", (PowerSystemState state) =>
{
    return Results.Ok(state);
});

// Pozwala nadpisaæ progi z poziomu przegl¹darki
app.MapPost("/api/config", (PowerSystemState state, FanConfigDto newConfig) =>
{
    state.ThresholdTurbo = newConfig.ThresholdTurbo;
    state.ThresholdSilent = newConfig.ThresholdSilent;
    state.Hysteresis = newConfig.Hysteresis;

    return Results.Ok(new { message = "Konfiguracja zaktualizowana", state });
});

app.Run();

// Klasa pomocnicza (DTO - Data Transfer Object) do odbierania danych z formularza
public class FanConfigDto
{
    public double ThresholdTurbo { get; set; }
    public double ThresholdSilent { get; set; }
    public double Hysteresis { get; set; }
}